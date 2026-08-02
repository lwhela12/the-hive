-- A HIVE gets a ceiling, and nothing inside it can reach above
--
-- Found by testing migration 124 rather than by reading it. A Show HIVE event
-- marked "public" was visible to OG HIVE members — because the item said public
-- and the rule believed it. The publishes_publicly flag only guarded the public
-- website, so the item leaked sideways into every other HIVE instead.
--
-- Per-item settings will always depend on somebody tapping the right thing. The
-- ceiling doesn't: it is set once, for the whole HIVE, and no item can be seen
-- further out than its HIVE allows. Show HIVE's ceiling is 'hive', so a
-- mis-tapped setting in there reaches precisely nobody.
--
-- Effective reach is the lower of what the item asks for and what its HIVE
-- permits. That's the whole idea.

-- The view reads publishes_publicly, so it goes first and is rebuilt below.
drop view if exists public.public_events;

alter table public.communities
  drop column if exists publishes_publicly;

alter table public.communities
  add column if not exists max_share_scope text not null default 'hive';

alter table public.communities
  drop constraint if exists communities_max_share_scope_check;
alter table public.communities
  add constraint communities_max_share_scope_check
  check (max_share_scope in ('hive', 'all_hives', 'public'));

comment on column public.communities.max_share_scope is
  'How far anything in this HIVE may travel, whatever an individual item asks for. Defaults to hive: a new HIVE keeps its contents to itself until somebody decides otherwise.';

-- OG HIVE has a public site and a public newsletter. Tech HIVE may share with
-- the other HIVEs but publishes nothing outward. Show HIVE keeps everything.
update public.communities set max_share_scope = 'public'    where slug = 'default';
update public.communities set max_share_scope = 'all_hives' where slug = 'tech';
update public.communities set max_share_scope = 'hive'      where slug = 'show';

-- Does this HIVE let its contents travel past its own members?
create or replace function public.community_shares_beyond_hive(c_id uuid)
returns boolean as $$
  select coalesce(
    (select max_share_scope in ('all_hives', 'public')
     from public.communities where id = c_id),
    false
  );
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- The rules again, with the ceiling in them
-- ---------------------------------------------------------------------------
drop policy if exists "Wishes viewable by scope" on public.wishes;
create policy "Wishes viewable by scope" on public.wishes
  for select using (
    auth.uid() = user_id
    or (
      status = 'public'
      and (
        public.is_community_member(community_id)
        or (
          share_scope in ('all_hives', 'public')
          and public.community_shares_beyond_hive(community_id)
          and public.is_any_community_member()
        )
      )
    )
  );

drop policy if exists "Events viewable by scope" on public.events;
create policy "Events viewable by scope" on public.events
  for select using (
    public.is_community_member(community_id)
    or (
      visibility in ('all_hives', 'public')
      and public.community_shares_beyond_hive(community_id)
      and public.is_any_community_member()
    )
  );

drop policy if exists "Survey responses viewable by scope" on public.survey_responses;
create policy "Survey responses viewable by scope" on public.survey_responses
  for select using (
    auth.uid() = user_id
    or public.is_community_member(community_id)
    or (
      share_scope in ('all_hives', 'public')
      and public.community_shares_beyond_hive(community_id)
      and public.is_any_community_member()
    )
  );

-- The world still needs both gates open: the item says public, and its HIVE is
-- allowed all the way out.
create or replace view public.public_events as
select
  e.id,
  e.title,
  e.description,
  e.event_date,
  e.end_date,
  e.event_time,
  e.location
from public.events e
join public.communities c on c.id = e.community_id
where e.visibility = 'public'
  and c.max_share_scope = 'public'
  and coalesce(e.end_date, e.event_date) >= current_date;

alter view public.public_events set (security_invoker = false);
revoke all on public.public_events from anon, authenticated;
grant select on public.public_events to anon, authenticated;

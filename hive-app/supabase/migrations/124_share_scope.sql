-- Three levels of sharing, enforced where it can't be forgotten
--
-- Nat, 2026-08-01: this HIVE / all HIVEs / public. No private tier — the last
-- attempt at one leaked, because visibility was decided by each screen and a
-- screen that forgets its filter shows everything.
--
-- So this lives in row-level security instead. A screen that forgets now shows
-- NOTHING, which is a bug report rather than a broken promise. That is the whole
-- reason to do it here.
--
-- Vocabulary: 'hive' (only this HIVE), 'all_hives' (anyone in any HIVE),
-- 'public' (the world, through a locked-down view — never the table itself).
--
-- Events keep the column they already have, because migration 118's public view
-- and a good deal of app code read events.visibility by name. Its 'members'
-- means the same as 'hive' everywhere else.

-- ---------------------------------------------------------------------------
-- 1. A HIVE decides whether it publishes outward AT ALL
-- ---------------------------------------------------------------------------
-- Per-item settings depend on somebody choosing correctly every single time.
-- This is the lock above them: a HIVE that doesn't publish cannot leak through
-- a mis-tapped setting, because the door isn't there. Show HIVE is the reason
-- this exists — its whole premise is a promise to somebody outside it.

alter table public.communities
  add column if not exists publishes_publicly boolean not null default false;

update public.communities set publishes_publicly = true where slug = 'default';

comment on column public.communities.publishes_publicly is
  'Whether anything from this HIVE may reach the public site. False by default: a new HIVE is private until someone says otherwise.';

-- ---------------------------------------------------------------------------
-- 2. Who counts as "anyone in any HIVE"
-- ---------------------------------------------------------------------------
create or replace function public.is_any_community_member()
returns boolean as $$
  select exists (
    select 1 from public.community_memberships
    where user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 3. The columns
-- ---------------------------------------------------------------------------
alter table public.wishes
  add column if not exists share_scope text not null default 'hive';
alter table public.wishes
  drop constraint if exists wishes_share_scope_check;
alter table public.wishes
  add constraint wishes_share_scope_check
  check (share_scope in ('hive', 'all_hives', 'public'));

alter table public.survey_responses
  add column if not exists share_scope text not null default 'hive';
alter table public.survey_responses
  drop constraint if exists survey_responses_share_scope_check;
alter table public.survey_responses
  add constraint survey_responses_share_scope_check
  check (share_scope in ('hive', 'all_hives', 'public'));

-- Events already had two levels; this adds the middle one.
alter table public.events
  drop constraint if exists events_visibility_check;
alter table public.events
  add constraint events_visibility_check
  check (visibility in ('members', 'all_hives', 'public'));

-- ---------------------------------------------------------------------------
-- 4. The rules
-- ---------------------------------------------------------------------------

-- Wishes. Yours are always yours to see. Everyone else's depend on how far the
-- author chose to share, and 'public' is not special here — the public site
-- reads a view, never this table.
drop policy if exists "Wishes viewable by community members" on public.wishes;
create policy "Wishes viewable by scope" on public.wishes
  for select using (
    auth.uid() = user_id
    or (
      status = 'public'
      and (
        (share_scope = 'hive' and public.is_community_member(community_id))
        or (share_scope in ('all_hives', 'public') and public.is_any_community_member())
      )
    )
  );

-- Events.
drop policy if exists "Events viewable by members" on public.events;
create policy "Events viewable by scope" on public.events
  for select using (
    (visibility = 'members' and public.is_community_member(community_id))
    or (visibility in ('all_hives', 'public') and public.is_any_community_member())
  );

-- Survey responses. Yours are yours; the rest follow the same ladder. Anything
-- shared beyond its own HIVE is material for the newsletter.
drop policy if exists "Members read survey responses" on public.survey_responses;
drop policy if exists "Survey responses viewable by members" on public.survey_responses;
create policy "Survey responses viewable by scope" on public.survey_responses
  for select using (
    auth.uid() = user_id
    or (share_scope = 'hive' and public.is_community_member(community_id))
    or (share_scope in ('all_hives', 'public') and public.is_any_community_member())
  );

-- ---------------------------------------------------------------------------
-- 5. What the world sees
-- ---------------------------------------------------------------------------
-- Two gates, both of which must be open: the item says public, AND its HIVE is
-- allowed to publish at all. One mis-tap can't get past the second.
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
  and c.publishes_publicly
  and coalesce(e.end_date, e.event_date) >= current_date;

alter view public.public_events set (security_invoker = false);
revoke all on public.public_events from anon, authenticated;
grant select on public.public_events to anon, authenticated;

comment on view public.public_events is
  'Upcoming events marked public, from HIVEs allowed to publish. Safe columns only. Read by the public site. Anonymous visitors have no access to public.events itself.';

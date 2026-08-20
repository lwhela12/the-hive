-- Public is an editorial door, never a member-reach setting.
--
-- Natalie, 2026-08-20: an unauthenticated visitor may see that HIVEs exist,
-- a generic description, a deliberately public invitation and the curated
-- newsletter. They may never see a member list, profile, HIVE membership,
-- internal role, wish, response, reply, birthday or identity-to-HIVE link.
-- Inside the signed-in app a person's choices stop at two rungs: this HIVE or
-- HIVE-Wide. A HIVE ceiling may narrow that choice; it may never widen it.

-- ---------------------------------------------------------------------------
-- 1. Member-owned reach has two rungs, everywhere and for every future HIVE.
-- ---------------------------------------------------------------------------

update public.wishes set share_scope = 'all_hives' where share_scope = 'public';
alter table public.wishes drop constraint if exists wishes_share_scope_check;
alter table public.wishes add constraint wishes_share_scope_check
  check (share_scope in ('hive', 'all_hives'));

update public.survey_responses set share_scope = 'all_hives' where share_scope = 'public';
alter table public.survey_responses drop constraint if exists survey_responses_share_scope_check;
alter table public.survey_responses add constraint survey_responses_share_scope_check
  check (share_scope in ('hive', 'all_hives'));

update public.board_replies set share_scope = 'all_hives' where share_scope = 'public';
alter table public.board_replies drop constraint if exists board_replies_share_scope_check;
alter table public.board_replies add constraint board_replies_share_scope_check
  check (share_scope in ('hive', 'all_hives'));

update public.profiles set default_share_scope = 'all_hives' where default_share_scope = 'public';
alter table public.profiles drop constraint if exists profiles_default_share_scope_check;
alter table public.profiles add constraint profiles_default_share_scope_check
  check (default_share_scope in ('hive', 'all_hives'));

update public.profiles
set birthday_visibility = 'all_hives'
where birthday_visibility = 'public';
update public.profiles
set birthday_invited_scope = 'all_hives'
where birthday_invited_scope = 'public';
alter table public.profiles drop constraint if exists profiles_birthday_visibility_check;
alter table public.profiles add constraint profiles_birthday_visibility_check
  check (birthday_visibility in ('members', 'all_hives'));
alter table public.profiles drop constraint if exists profiles_birthday_invited_scope_check;
alter table public.profiles add constraint profiles_birthday_invited_scope_check
  check (birthday_invited_scope in ('members', 'all_hives'));

comment on column public.wishes.share_scope is
  'Member-chosen reach: hive or all_hives. Public publication is a separate owner-reviewed path and never a wish setting.';
comment on column public.survey_responses.share_scope is
  'Member-chosen reach: hive or all_hives. Survey answers never publish to unauthenticated visitors.';
comment on column public.board_replies.share_scope is
  'Author-chosen reach: hive or all_hives. Replies never publish to unauthenticated visitors.';
comment on column public.profiles.default_share_scope is
  'Where new member content starts: hive or all_hives. Public is not a member-content reach.';
comment on column public.profiles.birthday_visibility is
  'Who inside the signed-in app may see the birthday: members or all_hives. Birthdays never identify a member publicly.';

-- ---------------------------------------------------------------------------
-- 2. A reusable last-line defence for the few curated public views.
-- ---------------------------------------------------------------------------

create or replace function public.text_mentions_hive_member(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    cross join lateral (
      select lower(split_part(trim(p.name), ' ', 1)) as first_name
    ) n
    where p.name is not null
      and length(n.first_name) >= 3
      and n.first_name = any (
        regexp_split_to_array(
          trim(regexp_replace(lower(coalesce(candidate, '')), '[^a-z0-9]+', ' ', 'g')),
          '[[:space:]]+'
        )
      )
  );
$$;

revoke all on function public.text_mentions_hive_member(text) from public, anon, authenticated;
comment on function public.text_mentions_hive_member(text) is
  'Private publication guard. Returns only yes/no and never reveals which member matched.';

-- Existing newsletters were written under the old rule. Preserve every word
-- and reply inside HIVE, but withdraw any issue that names a current member.
update public.board_posts bp
set visibility = 'all_hives'
from public.board_categories bc
where bc.id = bp.category_id
  and bc.topic_kind = 'newsletter'
  and bp.visibility = 'public'
  and public.text_mentions_hive_member(coalesce(bp.title, '') || ' ' || coalesce(bp.content, ''));

-- ---------------------------------------------------------------------------
-- 3. Only owner-reviewed editorial records may cross the public boundary.
-- ---------------------------------------------------------------------------

create or replace function public.guard_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_ceiling text;
  v_author_is_owner boolean;
begin
  if new.visibility is distinct from 'public' then
    return new;
  end if;

  select bc.topic_kind, c.max_share_scope
    into v_kind, v_ceiling
  from public.board_categories bc
  join public.communities c on c.id = new.community_id
  where bc.id = new.category_id and bc.community_id = new.community_id;

  if v_kind not in ('newsletter', 'helper_log') or v_ceiling is distinct from 'public' then
    raise exception 'Public publication uses the owner-reviewed newsletter or invitation path.'
      using errcode = '42501';
  end if;

  select coalesce(p.is_owner, false) into v_author_is_owner
  from public.profiles p where p.id = new.author_id;

  if not coalesce(v_author_is_owner, false)
     or (auth.uid() is not null and not public.is_hive_owner()) then
    raise exception 'Public publication is reviewed by the HIVE owner.'
      using errcode = '42501';
  end if;

  if public.text_mentions_hive_member(coalesce(new.title, '') || ' ' || coalesce(new.content, '')) then
    raise exception 'Public copy cannot name a HIVE member.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_post_visibility is
  'Public board rows are owner-reviewed newsletter/help editorial records, never an ordinary member-post reach.';

create or replace function public.guard_event_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ceiling text;
  v_creator_is_owner boolean;
begin
  if new.visibility is distinct from 'public'
     and new.invited_scope is distinct from 'public' then
    return new;
  end if;

  select c.max_share_scope into v_ceiling
  from public.communities c where c.id = new.community_id;
  select coalesce(p.is_owner, false) into v_creator_is_owner
  from public.profiles p where p.id = new.created_by;

  if v_ceiling is distinct from 'public'
     or not coalesce(v_creator_is_owner, false)
     or (auth.uid() is not null and not public.is_hive_owner()) then
    raise exception 'Public invitations are reviewed by the HIVE owner.'
      using errcode = '42501';
  end if;

  if public.text_mentions_hive_member(
    coalesce(new.title, '') || ' ' || coalesce(new.description, '') || ' ' || coalesce(new.location, '')
  ) then
    raise exception 'A public invitation cannot name a HIVE member.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_event_publication on public.events;
create trigger guard_event_publication
  before insert or update on public.events
  for each row execute function public.guard_event_publication();

comment on function public.guard_event_publication is
  'Public event rows are explicit owner-reviewed community invitations, not an ordinary member reach.';

-- ---------------------------------------------------------------------------
-- 4. Curated public views: safe columns, no generated profiles, no names.
-- ---------------------------------------------------------------------------

create or replace view public.public_events as
select
  e.id,
  e.title,
  e.description,
  e.event_date,
  e.end_date,
  e.event_time,
  case when e.invited_scope = 'public' then e.location else null::text end as location
from public.events e
join public.communities c on c.id = e.community_id
where e.visibility = 'public'
  and c.max_share_scope = 'public'
  and coalesce(e.end_date, e.event_date) >= current_date
  and not exists (
    select 1 from public.profiles p
    cross join lateral (select lower(split_part(trim(p.name), ' ', 1)) as first_name) n
    where p.name is not null and length(n.first_name) >= 3
      and n.first_name = any (regexp_split_to_array(
        trim(regexp_replace(
          lower(coalesce(e.title, '') || ' ' || coalesce(e.description, '') || ' ' || coalesce(e.location, '')),
          '[^a-z0-9]+', ' ', 'g'
        )), '[[:space:]]+'
      ))
  );

alter view public.public_events set (security_invoker = false);
revoke all on public.public_events from public, anon, authenticated;
grant select on public.public_events to anon, authenticated;
comment on view public.public_events is
  'Explicit owner-reviewed public invitations. No generated birthdays, member rows, authors or identity-to-HIVE association.';

create or replace view public.public_newsletters as
select bp.id, bp.title, bp.content, bp.created_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
join public.communities c on c.id = bp.community_id
where bc.topic_kind = 'newsletter'
  and bp.visibility = 'public'
  and c.max_share_scope = 'public'
  and coalesce(bp.status, 'active') <> 'archived'
  and not exists (
    select 1 from public.profiles p
    cross join lateral (select lower(split_part(trim(p.name), ' ', 1)) as first_name) n
    where p.name is not null and length(n.first_name) >= 3
      and n.first_name = any (regexp_split_to_array(
        trim(regexp_replace(lower(coalesce(bp.title, '') || ' ' || coalesce(bp.content, '')), '[^a-z0-9]+', ' ', 'g')),
        '[[:space:]]+'
      ))
  )
order by bp.created_at desc;

alter view public.public_newsletters set (security_invoker = false);
revoke all on public.public_newsletters from public, anon, authenticated;
grant select on public.public_newsletters to anon, authenticated;
comment on view public.public_newsletters is
  'Owner-reviewed public newsletter issues only. Member names and identity-to-HIVE associations are excluded.';

create or replace view public.public_help_focus as
select p.id, p.title, p.content, p.created_at
from public.board_posts p
join public.board_categories c on c.id = p.category_id
join public.communities co on co.id = p.community_id
where p.visibility = 'public'
  and c.topic_kind = 'helper_log'
  and co.slug = 'default'
  and co.max_share_scope = 'public'
  and p.status = 'active'
  and p.archived_at is null
  and not exists (
    select 1 from public.profiles member_profile
    cross join lateral (select lower(split_part(trim(member_profile.name), ' ', 1)) as first_name) n
    where member_profile.name is not null and length(n.first_name) >= 3
      and n.first_name = any (regexp_split_to_array(
        trim(regexp_replace(lower(coalesce(p.title, '') || ' ' || coalesce(p.content, '')), '[^a-z0-9]+', ' ', 'g')),
        '[[:space:]]+'
      ))
  )
order by p.created_at desc
limit 1;

alter view public.public_help_focus set (security_invoker = false);
revoke all on public.public_help_focus from public, anon, authenticated;
grant select on public.public_help_focus to anon, authenticated;

-- Views are read-only doors. Supabase's broad default table grants can be
-- re-applied after a migration, so name the public contract explicitly here.
revoke all on public.public_hives from public, anon, authenticated;
grant select on public.public_hives to anon, authenticated;

create or replace view public.public_hive_creed as
select bp.content, coalesce(bp.edited_at, bp.created_at) as updated_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
join public.profiles author on author.id = bp.author_id and author.is_owner = true
where bc.name = 'The HIVE Creed'
  and bc.reach = 'all_hives'
  and bp.title = 'The HIVE Creed'
  and bp.is_pinned = true
  and coalesce(bp.status, 'active') <> 'archived'
  and not exists (
    select 1 from public.profiles member_profile
    where member_profile.name is not null
      and length(trim(member_profile.name)) >= 3
      and lower(coalesce(bp.content, '')) like '%' || lower(trim(member_profile.name)) || '%'
  )
order by coalesce(bp.edited_at, bp.created_at) desc
limit 1;

alter view public.public_hive_creed set (security_invoker = false);
revoke all on public.public_hive_creed from public, anon, authenticated;
grant select on public.public_hive_creed to anon, authenticated;

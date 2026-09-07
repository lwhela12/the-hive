-- Public calendar consent and secret-HIVE boundary.
--
-- Public is a deliberate third rung for events. Ordinary events require an
-- owner review; birthdays are different because the profile owner is the
-- person granting consent. A separate `publicly_listed` flag keeps a HIVE's
-- existence out of every anonymous view even if one of its rows is
-- accidentally assigned a wider scope later.

alter table public.communities
  add column if not exists publicly_listed boolean not null default false;

-- OG HIVE and Tech HIVE may be acknowledged publicly. Production HIVE is
-- deliberately absent from public pages, APIs, newsletters and event feeds.
update public.communities
set publicly_listed = (slug in ('default', 'tech'));

comment on column public.communities.publicly_listed is
  'Explicit permission for this HIVE to exist on unauthenticated surfaces. Independent of member/content reach.';

-- A member may publish their own birthday. Existing profile UPDATE policies
-- keep this self-service: one member cannot change another member's choice.
alter table public.profiles drop constraint if exists profiles_birthday_visibility_check;
alter table public.profiles add constraint profiles_birthday_visibility_check
  check (birthday_visibility in ('members', 'all_hives', 'public'));
alter table public.profiles drop constraint if exists profiles_birthday_invited_scope_check;
alter table public.profiles add constraint profiles_birthday_invited_scope_check
  check (birthday_invited_scope in ('members', 'all_hives', 'public'));
alter table public.profiles drop constraint if exists profiles_birthday_invite_within_visibility_check;
alter table public.profiles add constraint profiles_birthday_invite_within_visibility_check check (
  case birthday_invited_scope when 'members' then 0 when 'all_hives' then 1 when 'public' then 2 end
  <=
  case birthday_visibility when 'members' then 0 when 'all_hives' then 1 when 'public' then 2 end
);

comment on column public.profiles.birthday_visibility is
  'Who may see this birthday: this HIVE, every HIVE, or the public. Public is the member''s own explicit choice.';
comment on column public.profiles.birthday_invited_scope is
  'Who is invited to this birthday; never wider than birthday_visibility.';

-- Public events remain owner-reviewed. They may name the people or performers
-- who deliberately belong in that public invitation; the event row itself is
-- the editorial approval boundary. A secret HIVE can never cross it.
create or replace function public.guard_event_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ceiling text;
  v_publicly_listed boolean;
  v_creator_is_owner boolean;
begin
  if new.visibility is distinct from 'public'
     and new.invited_scope is distinct from 'public' then
    return new;
  end if;

  select c.max_share_scope, c.publicly_listed
    into v_ceiling, v_publicly_listed
  from public.communities c where c.id = new.community_id;

  select coalesce(p.is_owner, false) into v_creator_is_owner
  from public.profiles p where p.id = new.created_by;

  if v_ceiling is distinct from 'public'
     or not coalesce(v_publicly_listed, false)
     or not coalesce(v_creator_is_owner, false)
     or (auth.uid() is not null and not public.is_hive_owner()) then
    raise exception 'Public invitations require an owner review in a publicly listed HIVE.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_event_publication is
  'Public event rows are explicit owner-reviewed invitations from a publicly listed HIVE.';

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
  and c.publicly_listed = true
  and coalesce(e.end_date, e.event_date) >= current_date

union all

select
  md5('birthday:' || p.id::text || ':' || to_char(b.next_date, 'YYYY'))::uuid as id,
  p.name || '''s birthday' as title,
  null::text as description,
  b.next_date as event_date,
  null::date as end_date,
  null::time as event_time,
  null::text as location
from public.profiles p
cross join lateral (
  select case
    when to_date(to_char(current_date, 'YYYY') || to_char(p.birthday, '-MM-DD'), 'YYYY-MM-DD') >= current_date
      then to_date(to_char(current_date, 'YYYY') || to_char(p.birthday, '-MM-DD'), 'YYYY-MM-DD')
    else to_date(to_char(current_date + interval '1 year', 'YYYY') || to_char(p.birthday, '-MM-DD'), 'YYYY-MM-DD')
  end as next_date
) b
where p.birthday is not null
  and p.birthday_visibility = 'public'
  and p.name is not null
  and exists (
    select 1
    from public.community_memberships cm
    join public.communities c2 on c2.id = cm.community_id
    where cm.user_id = p.id
      and c2.max_share_scope = 'public'
      and c2.publicly_listed = true
  );

alter view public.public_events set (security_invoker = false);
revoke all on public.public_events from public, anon, authenticated;
grant select on public.public_events to anon, authenticated;
comment on view public.public_events is
  'Owner-reviewed public invitations plus member-approved public birthdays. Secret HIVEs and birth years are excluded.';

create or replace view public.public_newsletters as
select bp.id, bp.title, bp.content, bp.created_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
join public.communities c on c.id = bp.community_id
where bc.topic_kind = 'newsletter'
  and bp.visibility = 'public'
  and c.max_share_scope = 'public'
  and c.publicly_listed = true
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

create or replace view public.public_hives as
  select slug, name, accent_color
  from public.communities
  where publicly_listed = true
  order by created_at asc;

alter view public.public_hives set (security_invoker = false);
revoke all on public.public_hives from public, anon, authenticated;
grant select on public.public_hives to anon, authenticated;
comment on view public.public_hives is
  'Only explicitly listed HIVEs: slug, display name and accent colour. Secret HIVEs do not exist on unauthenticated surfaces.';

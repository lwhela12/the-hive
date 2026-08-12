-- A birthday set to Public reaches the public site
--
-- Migration 164 gave every member control over how far their birthday
-- travels, and Nat set hers to Public straight away — *"i friggin love my
-- bday"*. Inside HIVE that works. On the-hive.app it never could, and she
-- found it herself on 2026-08-12: *"my bday is public!!!! why isnt that
-- poping up?"*
--
-- The reason is that a birthday is not a row. `useHiveDataQuery` builds
-- birthday cards in JavaScript from `profiles.birthday`, on the fly, each
-- time Home loads — there is no `events` row anywhere to find. The
-- `public_events` view reads `FROM events`, so it was searching a table that
-- birthdays have never been in. The setting promised something the public
-- surface had no way to honour.
--
-- So the view generates them, using the same rule the app uses: the next
-- occurrence, this year if it is still ahead, next year once it has passed.
--
-- Only `birthday_visibility = 'public'`, and only for members of a HIVE whose
-- own ceiling reaches the public (`max_share_scope`), so a member's choice and
-- their HIVE's ceiling both have to agree — exactly as the scope ladder says.
-- The YEAR of birth never leaves: the view publishes the upcoming date only,
-- so "12 October" goes out and "1987" stays home.

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

union all

select
  -- Stable and unique per person per year, so the site can key on it and a
  -- refresh does not reshuffle the list. Derived rather than stored, because
  -- there is no row to store it on.
  -- `md5(...)::uuid` rather than `uuid_generate_v5`, which needs the uuid-ossp
  -- extension this project does not enable.
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
  -- Their HIVE has to allow it too. A member in more than one qualifies once.
  and exists (
    select 1
    from public.community_memberships cm
    join public.communities c2 on c2.id = cm.community_id
    where cm.user_id = p.id and c2.max_share_scope = 'public'
  );

alter view public.public_events set (security_invoker = false);
revoke all on public.public_events from anon, authenticated;
grant select on public.public_events to anon, authenticated;

comment on view public.public_events is
  'What a stranger may see on the-hive.app: public events from HIVEs whose ceiling reaches the public, plus birthdays whose owner set them to Public (migration 170). Birthdays are generated here rather than stored, the same way the app generates them — the upcoming date only, never the year of birth.';

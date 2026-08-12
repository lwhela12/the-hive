-- 176 — the calendar sees every HIVE (2026-08-12)
--
-- Nat's parked idea, in her words: "A genuinely HIVE-Wide calendar, with a
-- coloured bee per HIVE's meeting day." The HIVE-Wide home screen now draws a
-- month grid with a bee on every HIVE's meeting day — including the HIVEs the
-- person looking is not in. That is the whole point: standing at HIVE-Wide you
-- see the rhythm of all of HIVE life at once.
--
-- The existing events SELECT policy cannot feed that grid. Checked live on
-- 2026-08-12 before writing this: a meeting event crosses HIVE lines only when
-- somebody marked it all_hives or public, and nearly every real meeting sits at
-- 'members' — so a member of one HIVE gets an empty calendar for the others.
--
-- A narrow security-definer function rather than a wider policy, because the
-- events row carries things that must NEVER travel between HIVEs: meet_link
-- (the Google Meet door is for that HIVE's members), location, description.
-- A broader policy would open the whole row to any select; this function hands
-- over exactly four facts — the day, the time, the title, and whose it is —
-- and a clever query cannot ask it for more.
--
-- The title gets one extra manner. Each HIVE has a ceiling on how far its
-- things may travel (communities.max_share_scope, migration 125). The bee on
-- the day ignores the ceiling — the calendar exists to show that a meeting
-- happens, which is Nat's ask, and the communities row already tells every
-- member each HIVE's meeting cadence (migration 137). But a meeting title is
-- words a member typed, so it honours the ceiling: a HIVE that keeps things at
-- home sends its title back as null, and the app just says "Meeting".

create or replace function public.hive_wide_meeting_days(from_date date, to_date date)
returns table (
  id uuid,
  title text,
  event_date date,
  event_time time,
  community_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    case
      -- your own HIVE's titles you could already read; a sharing HIVE's titles
      -- travel; a stay-home HIVE keeps its words and sends only the bee.
      when is_community_member(e.community_id) then e.title
      when community_shares_beyond_hive(e.community_id) then e.title
      else null
    end as title,
    e.event_date,
    e.event_time,
    e.community_id
  from public.events e
  where e.event_type = 'meeting'
    -- scheduled and completed both belong on a calendar you can walk backwards
    -- through. Anything else (a cancellation, a status not invented yet) stays
    -- home — the safe end is always the one that travels least.
    and coalesce(e.status, 'scheduled') in ('scheduled', 'completed')
    and e.event_date >= from_date
    and e.event_date <= to_date
    -- you have to be standing somewhere in HIVE before you can see the street.
    and is_any_community_member()
  order by e.event_date, e.event_time nulls last;
$$;

-- Signed-in members only. anon gets nothing, and the membership check inside
-- the function catches an authenticated token that belongs to no HIVE.
revoke all on function public.hive_wide_meeting_days(date, date) from public;
revoke all on function public.hive_wide_meeting_days(date, date) from anon;
grant execute on function public.hive_wide_meeting_days(date, date) to authenticated;

-- A HIVE that keeps things at home is not on anybody else's calendar.
--
-- Nat, 2026-09-02, describing the rule in her own words: *"Izzy, who is in OG &
-- Tech, can't see that Pro HIVE has a meeting, cos that visibility is locked
-- down."*
--
-- Migration 176 built the HIVE-Wide calendar to show every HIVE's meeting days,
-- and said so deliberately: *"the bee on the day ignores the ceiling — the
-- calendar exists to show that a meeting happens."* Only the TITLE honoured the
-- ceiling, so a stay-home HIVE showed an unlabelled bee reading "Meeting".
--
-- That was a defensible reading in August, when every HIVE shared at least
-- HIVE-Wide and no ceiling was ever set to `hive`. **Production's was set to
-- `hive` earlier today**, at Nat's instruction — *"Production is the most
-- private of all of them... they should not even stop at HIVE-Wide"* — and the
-- day that landed, the sentence "the bee ignores the ceiling" stopped being a
-- design choice and became a leak. Izzy would have seen an anonymous meeting on
-- 10 September and known Production met that day.
--
-- The fact that a meeting happens is itself a fact about a HIVE. A HIVE that
-- shares nothing shares that too.
--
-- So the bee now asks the same question everything else in HIVE asks: does this
-- THING say it travels, and does its HIVE allow it. A meeting nobody marked as
-- travelling stays home, whichever HIVE it belongs to.
--
-- Everything else about the function is untouched: it still hands over exactly
-- five facts — day, start, end, title, whose — still never sees a meet_link, a
-- location or a description, and still requires you to be standing somewhere in
-- HIVE. The title `case` stays as it is: unreachable now that the WHERE has
-- narrowed, and kept precisely so that loosening the WHERE again cannot
-- silently spill titles.
--
-- Rebuilt from the LIVE function body, not from 176 — a later migration added
-- `end_time` and the file on disk never caught up, so replacing 176's version
-- would have quietly dropped a column the app reads.

create or replace function public.hive_wide_meeting_days(from_date date, to_date date)
returns table (
  id uuid,
  title text,
  event_date date,
  event_time time,
  end_time time,
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
      when is_community_member(e.community_id) then e.title
      when community_shares_beyond_hive(e.community_id) then e.title
      else null
    end as title,
    e.event_date,
    e.event_time,
    e.end_time,
    e.community_id
  from public.events e
  where e.event_type = 'meeting'
    and coalesce(e.status, 'scheduled') in ('scheduled', 'completed')
    and e.event_date >= from_date
    and e.event_date <= to_date
    and is_any_community_member()
    -- Your own HIVE's meetings, always.
    --
    -- Anybody else's only when the MEETING ITSELF says it travels, and the
    -- HIVE allows it to. Both halves, the same way reach works everywhere else
    -- in HIVE: the thing's own visibility decides, and the HIVE's ceiling caps
    -- it (migration 125).
    --
    -- Nat's own words for the rule, 2026-09-02: *"if something is Tech-HIVE
    -- only, and I'm Charlee, who's not in Tech HIVE, then I don't get to see
    -- it. The OG and Tech HIVE meeting days are public / HIVE-Wide visibility,
    -- but only THAT HIVE invited, so they could be seen."*
    --
    -- 176 skipped this deliberately, on the grounds that *"nearly every real
    -- meeting sits at 'members', so a member of one HIVE gets an empty calendar
    -- for the others."* That was true on 12 August and is not true now: Tech's
    -- September meeting is `public`, OG's is `all_hives`, and Production's is
    -- `members` — every one of them says exactly what it wants, so the calendar
    -- can simply believe them.
    and (
      is_community_member(e.community_id)
      or (
        coalesce(e.visibility, 'members') in ('all_hives', 'public')
        and community_shares_beyond_hive(e.community_id)
      )
    )
  order by e.event_date, e.event_time nulls last;
$$;

revoke all on function public.hive_wide_meeting_days(date, date) from public;
revoke all on function public.hive_wide_meeting_days(date, date) from anon;
grant execute on function public.hive_wide_meeting_days(date, date) to authenticated;

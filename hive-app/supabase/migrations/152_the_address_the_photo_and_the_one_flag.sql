-- 152 — the address, the photo, and the one flag
--
-- Three things Nat found by walking the app on her own phone, 2026-08-06.

-- ---------------------------------------------------------------------------
-- 1. A publicly VISIBLE meeting was handing out its street address.
--
-- Migration 148 split one question into two: `visibility` is who may SEE that
-- a thing is happening, and `invited_scope` is who is actually INVITED — and
-- being invited is what earns you the address and the meet link. The public
-- view never learned the second half, so the August OG HIVE meeting, which is
-- `visibility = 'public'` and `invited_scope = 'members'` on purpose, was
-- publishing Nat's home address to anybody who loaded the-hive.app.
--
-- The meeting still appears. Only the address waits for an invitation.
--
-- (Applied to production by hand the moment it was found; recorded here so the
-- repo and the live database agree.)
create or replace view public_events as
select
  e.id,
  e.title,
  e.description,
  e.event_date,
  e.end_date,
  e.event_time,
  case when e.invited_scope = 'public' then e.location else null::text end as location
from events e
join communities c on c.id = e.community_id
where e.visibility = 'public'
  and c.max_share_scope = 'public'
  and coalesce(e.end_date, e.event_date) >= current_date;

-- ---------------------------------------------------------------------------
-- 2. The avatars bucket can finally close.
--
-- Migration 151 closed the LISTING (which is where the real harm was — the
-- folders are member ids, so an open listing is a roster of everybody in HIVE
-- with their photographs). It deliberately left `public = true` because two
-- screens still drew a face straight from the stored address and would have
-- gone blank: the profile tab icon in `app/(app)/_layout.tsx` and Home's
-- daily-question member strip in `app/(app)/hive.tsx`.
--
-- Both now render through `components/ui/Avatar.tsx`, which asks for a
-- short-lived signed link. That was the last of them, so the door shuts.
update storage.buckets set public = false where id = 'avatars';

-- ---------------------------------------------------------------------------
-- 3. Two switches for one idea, and neither worked alone.
--
-- `profiles.profile_scope` is what row-level security reads. A second column,
-- `visible_hive_wide`, is what the HIVE-Wide member list filtered on — and no
-- migration in this repo creates it, so it reached production outside the
-- tracked history. A member had to find and turn on BOTH, in two different
-- places, before anything appeared anywhere. That is the whole of Nat's
-- "I've been trying to select HIVE-Wide a billion times, it never reflects
-- that anywhere."
--
-- The app now reads and writes `profile_scope` only. This carries anyone who
-- set the old flag across, so they don't have to go and ask twice.
update public.profiles
set profile_scope = 'all_hives'
where visible_hive_wide is true
  and profile_scope is distinct from 'all_hives';

-- `visible_hive_wide` is referenced nowhere in the app now. It is left in place
-- deliberately: dropping a column that arrived outside the migration history is
-- a separate, deliberate act, and this migration is not the place to guess.

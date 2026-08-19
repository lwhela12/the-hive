-- Which HIVEs meet on Google Meet, and which meet inside HIVE.
--
-- The app grew one door on 2026-08-15 and it was the right call for a room:
-- OG sits around Nat's table with the deck on the TV, Production sits around
-- Charlee's with five laptops open, and a second front door there leads to an
-- empty Meet with nobody in it.
--
-- Tech HIVE is not a room. Nat and Lucas, 2026-08-19: *"everyone who's in Tech
-- HIVE is going to use Google Meet all the time, so that's going to be a very
-- familiar place for them ... it's free, because the other one we're using
-- inside the app costs money."* Nat's decision the same day: *"yeah, let's do
-- that."*
--
-- Per HIVE, not one setting for the app, for the same reason transcripts are
-- (migration 183): the answer genuinely differs by how that HIVE meets.
--
-- There is a second thing this flag buys, and it is the reason it exists at
-- all rather than being a note in somebody's head. Google Meet saves a
-- transcript into the MEETING HOST's Drive, and the HIVE Google account is the
-- account that creates every one of these invitations. So a Meet link created
-- on a HIVE calendar event puts the transcript in a Drive the app can already
-- read — which is what `import-meet-transcripts` (migration 189) then files
-- back into the meeting record without anybody fetching anything.
alter table public.communities
  add column if not exists meets_on_google_meet boolean not null default false;

comment on column public.communities.meets_on_google_meet is
  'Does this HIVE meet on Google Meet instead of inside the app? Off by default: a HIVE that gathers in one room wants one door, and a Meet link there is an empty room. On for Tech HIVE, which is entirely remote. When on, schedule-meeting asks Google for a conference link and the invitation carries it alongside the deck.';

-- Tech HIVE meets remotely, everybody on their own machine, and moves to Meet
-- from its 2026-09-03 meeting onward.
update public.communities set meets_on_google_meet = true where slug = 'tech';

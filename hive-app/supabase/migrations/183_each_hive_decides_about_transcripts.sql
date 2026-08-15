-- Each HIVE decides for itself whether the meeting gets written down.
--
-- Nat, 2026-08-15, once she understood what a transcript can and cannot do:
-- *"I just want to make sure that we can always toggle on if we want
-- transcripts or not. Because if there are multiple people in one room, then
-- I'll have transcripts off and I'll update the meeting helper. But if we're
-- all remote, like for tech hive, then I'll put transcripts on. So as long as
-- there's a big, obvious toggle in the meeting helper, where the people join
-- with the video, that would be freaking awesome."*
--
-- The reason it has to be a per-HIVE choice and not one setting for the app:
-- transcripts are labelled by MICROPHONE, not by voice. Six people around one
-- laptop in Nat's dining room are one microphone and therefore one speaker,
-- which is exactly why Google Meet's transcripts have always said "Lucas
-- Whelan" for the whole table and "Nick" for Washington. Tech HIVE is entirely
-- remote, everybody on their own device, so every line comes back with the
-- right name on it — the same feature is genuinely useful there and noise in
-- the dining room.
--
-- Off by default: nothing starts recording anybody because a column appeared.

alter table public.communities
  add column if not exists transcripts_enabled boolean not null default false;

comment on column public.communities.transcripts_enabled is
  'Does this HIVE transcribe its meetings? Per-HIVE because speaker labels only mean anything when everyone is on their own device (Tech HIVE), not when a room shares one microphone (OG). Toggled from the deck''s video panel by an admin.';

-- Tech HIVE meets remotely, every member on their own microphone, and talks in
-- specifics worth keeping — Nat: *"the specificity in tech hive matters and the
-- actual transcripts, I think will matter ... each person talking about where
-- they are in their project."*
update public.communities set transcripts_enabled = true where slug = 'tech';

-- No new policy: `Community admins can update` already governs this table, so
-- the toggle is an admin's to throw and nobody else's.

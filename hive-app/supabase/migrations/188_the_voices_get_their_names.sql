-- The voices get their names.
--
-- AssemblyAI splits a recording by voice, not by person, so a transcript from a
-- room around one laptop comes back as "Speaker A", "Speaker B", "Speaker C".
-- That is genuinely useful — you can see the conversation turn over — and it is
-- one step short of a record anybody can read a year later.
--
-- Nat, 2026-08-19: *"Speaker A, Speaker B, Speaker C is totally fine. It'd be
-- cool if I could go in and label that."*
--
-- And how she plans to make the labelling easy — the room introduces itself at
-- the top of the meeting: *"hi, I'm Natalie ... and the next person will say,
-- I'm so-and-so."* So the answers are usually sitting in the first minute of
-- the transcript, which is what the app reads to offer a suggestion. A person
-- still confirms it; a guess never saves itself.
--
-- The map is stored rather than the rewritten transcript, for two reasons:
-- `transcript_raw` stays exactly what the machine heard, and a name that turns
-- out to be wrong is one word to change instead of a whole document to redo.

alter table public.meetings
  add column if not exists speaker_names jsonb not null default '{}'::jsonb;

comment on column public.meetings.speaker_names is
  'Who each voice in transcript_raw belongs to: the transcript''s own label mapped to the person''s name, e.g. {"A": "Nat", "B": "Charlee"}. Written by a HIVE admin from the meeting summary screen, suggested from the roll call at the top of the meeting. Empty means nobody has named the voices yet, and the transcript reads "Speaker A".';

-- No new policy. "Members can update meetings" (migration 147) already governs
-- this table, and the naming boxes are shown to admins only in the app.

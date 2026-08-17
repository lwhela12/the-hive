-- Each HIVE remembers when it has to be finished.
--
-- The deck's timekeeper counts down to a "hard out" that has always defaulted
-- to 8pm and lived in React state — so it resets on every page load, and
-- somebody who needs a different one has to set it again at the start of every
-- meeting. Nat, 2026-08-17, on tomorrow: "we have pro HIVE at 4 & density at
-- 5." Production's first meeting has a real wall at 5pm, and a clock saying
-- "3h 20m 'til 8:00 PM" through it would be pacing her wrong all hour.
--
-- Per HIVE, because the wall belongs to the HIVE and not to the person looking
-- at the deck: OG meets in the evening and finishes when it finishes, Production
-- has Density waiting behind it. Nullable, and null keeps the old 8pm default,
-- so nothing changes for a HIVE that has never thought about it.
alter table communities
  add column if not exists meeting_hard_out text;

comment on column communities.meeting_hard_out is
  'When this HIVE''s meetings have to be over, as 24-hour HH:MM. Null means the deck''s 8pm default. Set from the clock on the Meeting Helper.';

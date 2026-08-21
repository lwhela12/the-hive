-- A meeting has an end time.
--
-- Nat, 2026-08-21, trying to put the Tech HIVE meeting in as 5-7pm: *"i
-- couldnt add window, like 5-7, i could only put in 5pm."* She was right --
-- `events` had `event_time` and no partner to it. `end_date` exists, but that
-- is for something that runs over several days, not an evening that finishes.
--
-- So every meeting in the app has only ever had a start. Members were told
-- what time to arrive and left to guess how long to hold, and every email that
-- quotes a meeting time has been quoting half of one.

alter table public.events
  add column if not exists end_time time;

comment on column public.events.end_time is
  'When this finishes, on the same day. Null means the start time is all anybody was told. For something spanning days, see end_date.';

-- The Tech HIVE meeting Nat was trying to fix when she found this.
update public.events
set end_time = '19:00:00'
where event_type = 'meeting'
  and event_date = '2026-09-03'
  and event_time = '17:00:00'
  and end_time is null;

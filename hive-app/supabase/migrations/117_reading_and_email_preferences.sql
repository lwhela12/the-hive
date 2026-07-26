-- Currently reading, and per-email opt-outs.
--
-- Two things members asked for, both about not being shouted at:
--
-- 1. "What are you currently reading" is conversation fodder for the mingle
--    before a meeting, so it's collected in the check-in (which people DO
--    answer, because it arrives as a link) rather than as a profile field
--    nobody would go back and edit. It lands on the profile as a side effect.
--
-- 2. The HIVE sends three app emails a cycle plus the newsletter, and Izzy
--    said one a month is plenty. Rather than cut one for everybody, let each
--    person turn off the ones they don't want. Defaults stay on so nothing
--    changes for anyone who never opens settings.
--
-- email_reminders_enabled stays as the master switch — off there means no app
-- email at all, regardless of the individual toggles below.

alter table public.profiles
  add column if not exists currently_reading text,
  add column if not exists email_newsletter_enabled boolean not null default true,
  add column if not exists email_midpoint_checkin_enabled boolean not null default true,
  add column if not exists email_meeting_checkin_enabled boolean not null default true;

comment on column public.profiles.currently_reading is
  'Free text from the monthly check-in; shown on the profile. Not a permanent favourite — see favorite_book for that.';
comment on column public.profiles.email_newsletter_enabled is
  'Newsletter is sent manually from Wix, so this is a record of intent Nat applies there — the app does not send it.';
comment on column public.profiles.email_midpoint_checkin_enabled is
  'The month-end "newsletter is brewing" check-in email.';
comment on column public.profiles.email_meeting_checkin_enabled is
  'The pre-meeting check-in email AND the meeting-day last call.';

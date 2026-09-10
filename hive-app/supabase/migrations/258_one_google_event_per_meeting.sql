-- HIVE creates the Google event for a scheduled meeting. Keep its canonical
-- browser URL so "Open in Google Calendar" opens that event instead of making
-- a second draft (and therefore a second Google Meet link).

alter table public.events
  add column if not exists google_event_url text;

comment on column public.events.google_event_url is
  'Canonical Google Calendar htmlLink returned when HIVE creates the meeting.';

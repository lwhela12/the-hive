-- Multi-day events: an optional end_date turns an event into a date range
-- (e.g. "Nat out of town" Jul 21 – Jul 25). Single-day events leave it null.
-- "All day" is represented the way it always has been: event_time is null.

alter table public.events add column if not exists end_date date;

comment on column public.events.end_date is
  'Inclusive last day of a multi-day event; null for single-day events.';

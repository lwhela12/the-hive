-- Per-member unsubscribe for app reminder emails (check-in reminders, etc.).
-- In-app notifications and push are unaffected — this only quiets the inbox.
alter table public.profiles
  add column if not exists email_reminders_enabled boolean not null default true;

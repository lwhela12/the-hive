-- App Feedback is Nat's product inbox. Keep this separate from broad activity
-- mail so another owner can opt into HIVE activity without receiving private
-- feedback triage. Snapshot the sender email so the in-app inbox and the email
-- notification always describe the same person.

alter table public.profiles
  add column if not exists email_app_feedback_enabled boolean not null default false;

update public.profiles
  set email_app_feedback_enabled = (email = 'natwalstead@gmail.com')
  where is_owner = true;

alter table public.app_feedback
  add column if not exists author_email text;

update public.app_feedback af
  set author_email = p.email
  from public.profiles p
  where af.author_id = p.id
    and af.author_email is null;

comment on column public.profiles.email_app_feedback_enabled is
  'Receives newly filed app-feedback alerts. Separate from HIVE activity mail.';

comment on column public.app_feedback.author_email is
  'Sender email snapshotted for the private owner inbox and support follow-up.';

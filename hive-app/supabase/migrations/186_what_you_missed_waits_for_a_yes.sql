-- A member chooses whether a sealed-meeting catch-up may reach their inbox.
-- Missing the meeting is explicitly confirmed in Meeting Helper at Wrap-Up;
-- pre-meeting attendance answers never trigger this email by themselves.
alter table public.profiles
  add column if not exists email_post_meeting_recap_enabled boolean not null default true;

comment on column public.profiles.email_post_meeting_recap_enabled is
  'Send the approval-gated What You Missed email when this member is explicitly marked absent at Wrap-Up.';

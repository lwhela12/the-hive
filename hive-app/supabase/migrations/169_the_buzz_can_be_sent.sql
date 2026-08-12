-- The Buzz can actually be sent
--
-- Migration 123's comment described the design as settled: *"Members come
-- from profiles.email_newsletter_enabled instead; the two are merged and
-- de-duplicated at send time."* There was no send time. Sign-up, welcome
-- email, unsubscribe and the published archive were all built; the one thing
-- that puts an issue in somebody's inbox never was, so The Buzz has only ever
-- been readable by people who went looking for it.
--
-- This table is the receipt. It exists for one reason above all: **a second
-- click must not mail everybody twice.** The send function refuses a live
-- send for an issue that already has one, unless it is told explicitly to
-- send again — so the failure mode of a slow-loading button is a polite
-- refusal rather than a duplicate landing in ninety inboxes.
--
-- It doubles as the answer to "did that actually go, and to how many?",
-- which otherwise lives only in a Resend dashboard nobody has open.

create table if not exists public.newsletter_sends (
  id uuid default gen_random_uuid() primary key,
  post_id uuid not null references public.board_posts(id) on delete cascade,
  -- 'test' goes only to the person who pressed it. 'live' goes to the list.
  mode text not null default 'live',
  sent_by uuid references public.profiles(id),
  recipient_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz default now(),
  constraint newsletter_sends_mode_check check (mode in ('test', 'live'))
);

create index if not exists newsletter_sends_post_idx
  on public.newsletter_sends (post_id, mode, created_at desc);

alter table public.newsletter_sends enable row level security;

-- Reading the send history crosses every HIVE and names how far an issue
-- travelled, so it follows migration 128's line: owners, not each HIVE's
-- admin. Writes come only from the send function on the service role, so
-- there is deliberately no insert policy here at all — the same shape
-- app_feedback uses (migration 138).
grant select on public.newsletter_sends to authenticated;

drop policy if exists "Owners can read the send history" on public.newsletter_sends;
create policy "Owners can read the send history" on public.newsletter_sends
  for select using (public.is_hive_owner());

comment on table public.newsletter_sends is
  'One row per time an issue of The Buzz was mailed. Guards against a double click mailing the list twice, and answers "did it go, and to how many?". Written only by the send-newsletter function on the service role.';

-- App Feedback stops being a wish in a costume.
--
-- Nat, 2026-08-03, after clicking App Feedback while standing at HIVE-Wide and
-- landing on Production HIVE's home page: "ohhhhhhhhhhhh probably because the
-- app feedback is just a shortcut to my wishes, and my wishes aren't HIVE wide.
-- I think it could look cooler & more upscale if the app feedback was its own
-- entity, instead of just linked to a wish... Have a little intake form there,
-- instead of linking to a wish? i like that a lot."
--
-- She had diagnosed it exactly. App Feedback was a shortcut that searched one
-- HIVE's wishes for a title containing "bug report" and opened it. That has
-- three problems, and the landing-in-the-wrong-HIVE one is the smallest:
--
--   1. It needs a community_id, so it cannot mean anything at HIVE-Wide — and
--      feedback on the app is feedback on all of it, wherever you stand.
--   2. It needed somebody to have made a wish with the right words in its title.
--      A HIVE without one got "Not set up yet" for an app-wide feature.
--   3. Anything said there was public to that HIVE. "This screen confuses me"
--      is a note to the people who build the app, not a wish for your friends
--      to grant.
--
-- So feedback gets its own table, its own screen and its own door. Wishes go
-- back to being wishes.
--
-- WHO CAN READ IT: the person who wrote it, and the two people who run the HIVE
-- (public.is_hive_owner(), migration 128). Deliberately NOT community admins —
-- this is feedback about the software, not about anybody's HIVE, and Nic running
-- OG HIVE is not a reason to hand him another member's bug reports.
--
-- WHO CAN WRITE IT: nobody, directly. There is no insert policy on purpose. The
-- app posts to the `app-feedback` edge function, which verifies the caller's JWT
-- and writes the row with the service key. One door means the stored row and the
-- email that announces it can never disagree about who said what — a member
-- cannot file feedback under somebody else's name, because they never touch the
-- table.

create table if not exists public.app_feedback (
  id uuid primary key default uuid_generate_v4(),

  -- Kept if the person leaves, because the bug they found does not leave with
  -- them. The name is snapshotted for the same reason: a report that reads
  -- "somebody said the meetings tab was broken" is worth less than one with a
  -- name on it, and profiles can be deleted.
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,

  -- Where they were standing when they said it. NULL means HIVE-Wide, which is
  -- a real answer and not missing data — it is now the place most people start.
  community_id uuid references public.communities(id) on delete set null,

  kind text not null default 'bug'
    check (kind in ('bug', 'idea', 'confusing', 'love')),

  message text not null check (char_length(trim(message)) between 1 and 4000),

  -- Optional. "Which bit?" in their words — the screen name, the button, the
  -- thing they were doing. Free text on purpose: asking somebody to pick their
  -- route out of a menu is asking them to do our filing.
  where_in_app text check (where_in_app is null or char_length(where_in_app) <= 300),

  -- 'web' or 'ios'. A bug that only happens in one of them is the most common
  -- kind of bug this app has, and asking after the fact never works.
  platform text,

  status text not null default 'new' check (status in ('new', 'read', 'done')),

  created_at timestamptz not null default now()
);

comment on table public.app_feedback is
  'Feedback about the app itself. Written only by the app-feedback edge function; readable by its author and by is_hive_owner(). community_id NULL means it was sent from HIVE-Wide.';

-- Nat reads this newest-first and nothing else ever queries it.
create index if not exists app_feedback_created_idx
  on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;

create policy "You can read your own feedback"
  on public.app_feedback for select
  using (author_id = auth.uid());

create policy "The people who run the HIVE read all feedback"
  on public.app_feedback for select
  using (public.is_hive_owner());

-- Only for marking something read or done. Nobody edits the words: not the
-- author (a bug report that changes after it is filed is worse than no bug
-- report) and not the owner.
create policy "The people who run the HIVE can triage feedback"
  on public.app_feedback for update
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

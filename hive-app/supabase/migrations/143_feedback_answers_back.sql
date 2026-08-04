-- Feedback stops being a list of grievances.
--
-- Nat, 2026-08-04, looking at the "What you've sent" tab she had just been
-- given: "is that just what an individual has said? or all HIVE? does it show
-- the turn around and the fix as well? or just a list of grievances?"
--
-- She had found the hole by asking the right question. The answers were: yours
-- only, no, and yes — a list of grievances. Migration 138 gave the table a
-- `status` column (new/read/done) and an update policy so an owner could triage,
-- and then nothing in the app could set it. So the badge existed, the permission
-- existed, and the only way to flip either was to open the database by hand.
--
-- A one-way form is worse than no form. Somebody writes down the thing that
-- annoyed them, presses send, and hears nothing back forever; the second report
-- is shorter than the first and there is rarely a third. What makes people keep
-- telling you things is being told what happened next.
--
-- So feedback gets an answer. Three columns and nothing clever:
--
--   reply       what was done about it, in words, from an owner
--   replied_at  when — so "sent 3 weeks ago, answered yesterday" can be read
--   replied_by  who, because two people run this and the reply has a voice
--
-- The status column stays exactly as it was. It is now reachable from the
-- screen instead of only from psql, which is the whole change.

alter table public.app_feedback
  add column if not exists reply text
    check (reply is null or char_length(trim(reply)) between 1 and 4000),
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references public.profiles(id) on delete set null,
  add column if not exists replied_by_name text;

comment on column public.app_feedback.reply is
  'What the people who build the app said back. Visible to the author — this is the half that makes the form worth filling in twice.';

-- The screenshots. Feedback that arrives with a picture of the problem is worth
-- several that describe it, and Nat means to ask for them by name: "encourage
-- people to just take a screen shot & upload it here, that's the easiest way to
-- get notes — or if it's on their phone, an annotated screen shot."
--
-- Shape matches board_posts.attachments and messages.attachments exactly, so the
-- same picker, the same upload path and the same gallery all work unchanged. A
-- third shape for the same idea would be a third thing to fix later.
alter table public.app_feedback
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.app_feedback.attachments is
  'Same shape as board_posts.attachments. Written only by the app-feedback edge function, from files the caller uploaded to their own folder in the attachments bucket.';

-- A marked-up screenshot IS the report. Migration 138 required between 1 and
-- 4000 characters of message, which was right when words were all there was and
-- is wrong now: telling somebody who has just circled the broken button in red
-- that they must also describe it in writing is asking them to do the work
-- twice. So the requirement moves from "words" to "something" — words, or a
-- picture, or both.
alter table public.app_feedback
  drop constraint if exists app_feedback_message_check;

alter table public.app_feedback
  add constraint app_feedback_message_length
    check (char_length(message) <= 4000);

alter table public.app_feedback
  add constraint app_feedback_says_something
    check (char_length(trim(message)) > 0 or jsonb_array_length(attachments) > 0);

-- Reading a reply needs no new policy: the author already selects their own row
-- (migration 138) and these are columns on it. Writing one needs no new policy
-- either — "The people who run the HIVE can triage feedback" is already an
-- unrestricted update for is_hive_owner().
--
-- What that update policy does NOT do is stop an owner rewriting the member's
-- words, which migration 138 said out loud it did not want. Postgres has no
-- column-level grant that survives an RLS update policy, so the guarantee gets
-- made where it can actually be enforced: a trigger. Now the words a person
-- filed are the words that stay filed, whoever is logged in.
create or replace function public.app_feedback_words_are_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message is distinct from old.message
     or new.author_id is distinct from old.author_id
     or new.author_name is distinct from old.author_name
     or new.kind is distinct from old.kind
     or new.where_in_app is distinct from old.where_in_app
     or new.platform is distinct from old.platform
     or new.community_id is distinct from old.community_id
     or new.attachments is distinct from old.attachments
     or new.created_at is distinct from old.created_at then
    raise exception 'App feedback is a record of what somebody said. Only status and the reply can change.';
  end if;
  return new;
end;
$$;

drop trigger if exists app_feedback_words_are_final on public.app_feedback;
create trigger app_feedback_words_are_final
  before update on public.app_feedback
  for each row execute function public.app_feedback_words_are_final();

-- Newest-unanswered-first is the only way anybody will ever read the triage
-- list, so it is the only index worth adding.
create index if not exists app_feedback_open_idx
  on public.app_feedback (created_at desc)
  where status <> 'done';

-- Four tables that knew which HIVE they belonged to, and never asked
--
-- The second half of the 2026-08-03 audit. Where migration 130 closed the ways
-- a member could gain power they shouldn't have, these are the places where no
-- power was needed at all: the row carried a community_id, and the rule that
-- guarded it only checked that you were signed in.
--
-- All four predate multi-HIVE. "Signed in" and "in this community" were the
-- same sentence when there was one community. They stopped being the same
-- sentence in migration 004 and nothing came back to revisit these.

-- ---------------------------------------------------------------------------
-- 1. Check-in answers: the ceiling has been inert since Saturday
-- ---------------------------------------------------------------------------
--
-- This is the one worth reading twice. Migration 057 created "Survey responses
-- viewable by community" using (auth.role() = 'authenticated'). Migration 124
-- then dropped "Members read survey responses" and "Survey responses viewable
-- by members" — two names that have never existed in this database — and 125
-- dropped "Survey responses viewable by scope". So the 057 policy was never
-- removed, and Postgres ORs permissive SELECT policies together.
--
-- The scoped, ceiling-aware rule written on Saturday has therefore been dead on
-- arrival: every check-in answer in every HIVE has been readable by anyone
-- signed in, no matter what share_scope or max_share_scope said. A drop that
-- names the wrong policy fails silently, which is exactly how a fence ends up
-- looking finished and being open.

drop policy if exists "Survey responses viewable by community" on public.survey_responses;

-- Rebuilt rather than trusted, so the intended rule is stated once, here.
drop policy if exists "Survey responses viewable by scope" on public.survey_responses;

create policy "Survey responses viewable by scope"
  on public.survey_responses for select
  using (
    auth.uid() = user_id
    or public.is_community_member(community_id)
    or (
      share_scope in ('all_hives', 'public')
      and public.community_shares_beyond_hive(community_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Daily questions and surveys
-- ---------------------------------------------------------------------------
--
-- Both carry community_id on every row. A Production HIVE member could read
-- every daily-question answer written in OG HIVE and Tech HIVE, and the full
-- question set of every survey anywhere. Neither table was touched by 124 or
-- 125, so no ceiling applied to them at all.

drop policy if exists "Answers viewable by authenticated members" on public.daily_question_answers;

create policy "Answers viewable by your HIVE"
  on public.daily_question_answers for select
  using (public.is_community_member(community_id));

drop policy if exists "Surveys viewable by community members" on public.surveys;

create policy "Surveys viewable by your HIVE"
  on public.surveys for select
  using (public.is_community_member(community_id));

-- ---------------------------------------------------------------------------
-- 3. Clive's memory was a public noticeboard
-- ---------------------------------------------------------------------------
--
-- The policy was named "Service role full access" and was written
-- `for all using (true) with check (true)` — with no TO clause. Without one it
-- applies to the `public` role, which includes anon and authenticated. So the
-- name described the intention and the code granted it to everybody.
--
-- What sat behind it: per-person summaries of private Clive conversations, and
-- summaries of every HIVE's boards and meetings. Readable by anyone holding the
-- published anon key, signed in or not, member of no HIVE at all — and writable
-- by them too, which means Clive's context could be poisoned as easily as read.

drop policy if exists "Service role full access" on public.context_summaries;

create policy "Only the server touches Clive's memory"
  on public.context_summaries for all
  to service_role
  using (true) with check (true);

-- Belt as well as braces: the table's grants were never narrowed either, so
-- being outside the policy would still have left the door on the latch.
revoke all on public.context_summaries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Meeting audio
-- ---------------------------------------------------------------------------
--
-- The bucket is private, so storage.objects policies are the only gate — and
-- the gate read `auth.role() = 'authenticated'`, for both reading AND writing.
-- The meetings table itself is properly fenced by is_community_member, so the
-- transcripts and summaries were safe while the recordings they were made from
-- were not.
--
-- New uploads are keyed by HIVE: the path is `<community_id>/imports/...`
-- (app/(app)/meetings.tsx). The eight files already in the bucket predate that
-- and sit at the root, left over from the recording flow removed on 2026-07-25.
-- They belong to nobody under this rule, which is the right answer for orphans:
-- owners can still reach them, nobody else can.

drop policy if exists "Authenticated users can read meeting recordings" on storage.objects;
drop policy if exists "Authenticated users can upload meeting recordings" on storage.objects;

create policy "Meeting audio belongs to its HIVE"
  on storage.objects for select
  using (
    bucket_id = 'meeting-recordings'
    and (
      public.is_hive_owner()
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        and public.is_community_member(((storage.foldername(name))[1])::uuid)
      )
    )
  );

create policy "You can only add meeting audio to your own HIVE"
  on storage.objects for insert
  with check (
    bucket_id = 'meeting-recordings'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_community_member(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- STILL OPEN, deliberately, and Nat's call
-- ---------------------------------------------------------------------------
--
-- The `attachments` bucket is PUBLIC. Every image on every board — including
-- Production HIVE's, whose promise is that nothing leaves — has a URL that
-- works for anyone holding it, forever, whatever the board says.
--
-- Not fixed here because closing it means every image in the app has to be
-- fetched through a signed link instead of a plain URL, which touches boards,
-- messages, profiles and the meeting helper. That is a real piece of work and
-- not one to start in the same hour as this. It is the largest thing left
-- outside the fence.

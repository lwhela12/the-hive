-- THE HIVE AN ANSWER IS ABOUT BECOMES A REAL COLUMN, SO AN UPSERT CAN NAME IT.
--
-- This finishes what migration 228 started, and fixes what 228 broke.
--
-- ## What 228 broke, and how
--
-- 228 widened the uniqueness rule to `(survey_id, user_id, response_period,
-- coalesce(community_id, sentinel))` so one check-in could hold an answer for
-- each HIVE a person is in — and dropped the three-column index in the same
-- statement. An upsert names its conflict target BY COLUMN, and Postgres
-- refuses with 42P10 unless a unique index matches those columns exactly. The
-- app had always said `on_conflict=survey_id,user_id,response_period`.
--
-- So every check-in submit in the app began failing the moment 228 applied,
-- with no error anywhere except in the face of whoever pressed Save. Nobody
-- happened to be answering during the window, which is luck and not design.
-- The three-column index was put straight back; both now exist.
--
-- An EXPRESSION index cannot be an upsert's conflict target at all — there are
-- no column names to name. That is the real defect in 228: it chose an index
-- shape the app could never address.
--
-- ## The fix
--
-- `community_key` is the same coalesce, but stored as a real generated column,
-- so the unique index is on four ordinary columns and the app can name them.
-- Generated and stored rather than a trigger: it cannot drift from
-- `community_id`, nothing can write it directly, and it costs one uuid a row.
--
-- ## Order this was shipped in, deliberately
--
-- The APP WENT FIRST. `upsertSurveyResponse` in `lib/hooks/useSurveys.ts` now
-- tries three conflict targets, widest first, falling back on 42P10 — each one
-- a real historical shape of this table. So the deploy before this migration
-- works (attempt 1 fails, attempt 2 succeeds) and the deploy after it works
-- (attempt 1 succeeds), and there is no window in between where saving is
-- broken. That is the lesson from 228, written into the sequence rather than
-- into a comment nobody reads twice.

begin;

alter table public.survey_responses
  add column if not exists community_key uuid
  generated always as (coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

comment on column public.survey_responses.community_key is
  'community_id with null folded to a fixed sentinel, so the uniqueness rule '
  'can be a plain four-column index an upsert is able to name. Never written '
  'directly — it is generated from community_id.';

-- The replacement first: nothing may be dropped until its successor exists, or
-- a concurrent write between the two statements could land a duplicate.
create unique index if not exists survey_responses_one_per_hive_idx
  on public.survey_responses (survey_id, user_id, response_period, community_key);

comment on index public.survey_responses_one_per_hive_idx is
  'One answer per person, per cycle, PER HIVE. A merged check-in covering '
  'several HIVEs writes one row each; a HIVE-Wide answer belongs to no HIVE '
  'and stays one row per person per cycle via the sentinel.';

-- The one that blocked per-HIVE rows, and the un-nameable expression index
-- from 228 that replaced it.
drop index if exists public.survey_responses_survey_user_period_idx;
drop index if exists public.survey_responses_survey_user_period_hive_idx;

commit;

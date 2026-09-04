-- ONE CHECK-IN CAN HOLD AN ANSWER FOR EACH HIVE YOU ARE IN.
--
-- Nat, 2026-09-04: *"I want those to show all the hives people are in, so it
-- doesn't matter if you're in 1 hive or 3, you only get 1 survey at the end of
-- the month & 1 survey the week of meetings & you can look through all of the
-- to do lists & stuff, and update everything."*
--
-- Two check-ins for everybody, and each one covers every HIVE the answerer
-- belongs to. Five of the sixteen members are in more than one HIVE today, and
-- they get three of everything.
--
-- ## Why this is the only schema change the merge needs
--
-- `survey_responses` has carried `community_id` since the beginning, and every
-- consumer that matters — the Arrival Board, the Meeting Helper deck,
-- `seal-meeting`, the newsletter draft — already reads answers filtered BY that
-- column. So a merged survey does not need a new shape: it writes ONE ROW PER
-- HIVE, each row saying which HIVE its answers are about, and all of those
-- readers keep working untouched. The alternative — one row with the HIVEs
-- nested inside `answers` — would have meant teaching every one of them a new
-- JSON shape, which is more code and more places to get it wrong.
--
-- The only thing standing in the way is the uniqueness rule. Migration 096
-- made it `(survey_id, user_id, response_period)` so a standing monthly survey
-- could be answered every month without overwriting last month. That is still
-- exactly right; it just never imagined one person answering one survey for
-- three different HIVEs in the same month.
--
-- ## Why `coalesce` rather than plain `community_id`
--
-- Postgres treats NULLs as distinct in a unique index, so a bare
-- `community_id` column would let the SAME person write unlimited rows with a
-- null HIVE — which is precisely the row shape the HIVE-Wide "End of the
-- month" uses today. Folding null down to a fixed sentinel keeps one row per
-- person per period for HIVE-Wide answers, and one row per HIVE for the rest.
-- `NULLS NOT DISTINCT` would say the same thing on Postgres 15+, but an
-- expression index says it on every version and cannot be silently lost in a
-- restore to an older one.

begin;

-- Nothing may be dropped until its replacement exists, or a concurrent write
-- between the two statements could land a duplicate.
create unique index if not exists survey_responses_survey_user_period_hive_idx
  on public.survey_responses (
    survey_id,
    user_id,
    response_period,
    coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

drop index if exists public.survey_responses_survey_user_period_idx;

comment on index public.survey_responses_survey_user_period_hive_idx is
  'One answer per person, per cycle, PER HIVE. Migration 228: a single check-in '
  'now covers every HIVE the answerer is in, writing one row each, so the '
  'Arrival Board and the deck can still read one HIVE''s answers by '
  'community_id. Null (a HIVE-Wide answer belonging to no HIVE) folds to a '
  'sentinel so it stays one row per person per cycle.';

comment on column public.survey_responses.community_id is
  'Which HIVE these answers are ABOUT — not which HIVE the person was standing '
  'in when they wrote them. Null means the answer belongs to no single HIVE, '
  'which is what the HIVE-Wide End of the month writes (migration 225).';

commit;

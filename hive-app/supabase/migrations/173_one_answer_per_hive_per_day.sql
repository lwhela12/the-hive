-- Every HIVE has its own 365 daily questions now (Nat's call, 2026-08-12),
-- so a person in two HIVEs gets two different questions on the same day.
-- The old unique index — one answer per person per DAY, from migration 060,
-- written when there was one shared deck — made the second HIVE's save fail
-- with the generic "Could not save your answer." One answer per person per
-- HIVE per day is the real rule.
--
-- Existing rows already satisfy the wider key (the old key was stricter),
-- so this reshapes nothing and can run on live data.

drop index if exists public.daily_question_answers_user_date_idx;

create unique index if not exists daily_question_answers_user_hive_date_idx
  on public.daily_question_answers(user_id, community_id, question_date);

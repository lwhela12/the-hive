-- The answers were always there. Nothing could read them.
--
-- Nat's rule, 2026-08-27, and it is the strongest product rule she has given:
-- *"If you're going to make someone answer a question, you better damn well
-- know what you're going to do with the answer. Having people fill out surveys
-- and then not having their answers go anywhere is just having them do busy
-- work, and it's bad."*
--
-- Admin's Newsletter box has read `survey_responses` for the newsletter answers
-- since 2026-08-17 — every HIVE's halfway check-in, printed under the member's
-- name and their HIVE, which is where Nat writes the letter from. The query it
-- uses selects and orders by `survey_responses.created_at`.
--
-- **There is no such column.** PostgREST answers that query with 42703
-- (`column survey_responses.created_at does not exist`), the panel throws the
-- result away, and the shout-out list has been silently empty for every check-in
-- anyone has ever filled in. It reads exactly like "nobody said anything".
--
-- `submitted_at` is when a member pressed send, and it is nullable while a
-- response is still a draft. `created_at` is when the row appeared, which is
-- what a listing sorts by — every other table in this schema has one, and this
-- table is the only one that never did. Adding it makes the box work with no
-- app deploy, and gives the ordering something that cannot be null.

alter table public.survey_responses
  add column if not exists created_at timestamptz;

-- Existing rows keep their real age: the moment they were submitted, or the
-- start of the response period if a draft never was.
update public.survey_responses
   set created_at = coalesce(submitted_at, now())
 where created_at is null;

alter table public.survey_responses
  alter column created_at set default now();

alter table public.survey_responses
  alter column created_at set not null;

comment on column public.survey_responses.created_at is
  'When the response row appeared. `submitted_at` is when the member pressed send and can be null on a draft; this cannot, so listings and Admin''s Newsletter box have something safe to order by.';

create index if not exists idx_survey_responses_created_at
  on public.survey_responses (created_at desc);

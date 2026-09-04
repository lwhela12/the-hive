-- THE ANSWERS ALREADY GIVEN COME ACROSS TO THE MERGED CHECK-IN.
--
-- Nat, 2026-09-04, on being told the cutover had to wait until after Tech's
-- first meeting: *"if someone already filled out their pre-meeting thing, i
-- think i saw kelly & brietta & lucas do it, then they woudltn get a reminder,
-- only the peopel who havent done it yet would. and i dont see why there's an
-- issue."*
--
-- She is right. The five answers in flight are not stranded by the merge, they
-- are stranded by living on a different ROW — and a row is a thing you can
-- copy. Everything the delay was protecting is protected by this file instead.
--
-- ## What is in flight
--
--   4 on Tech's "Before our first meeting", for its first meeting on 8 Sept.
--   1 on OG's "Monthly Check-in: POP + Energy", for September.
--
-- Both are read on a meeting night by the Arrival Board, which asks for the
-- LIVE check-in filtered by that HIVE — so the moment the per-HIVE rows close
-- and the merged one opens, it asks the merged row and finds nothing. Copying
-- them across with their own `community_id` makes the same question return the
-- same answers.
--
-- ## Why this is a copy and not a move
--
-- The originals stay. They are the record of what was answered against the
-- survey people actually opened, and nothing reads them once their row is
-- closed. A copy that goes wrong can be deleted; a move that goes wrong has
-- taken somebody's writing with it.
--
-- Idempotent: `survey_responses_one_per_hive_idx` is unique on (survey_id,
-- user_id, response_period, community_key), so running this twice changes
-- nothing the second time.

-- --------------------------------------------------------------------------
-- The merged row's date, first — it decides the period the copies are filed in
-- --------------------------------------------------------------------------
--
-- The app's convention for a check-in's due date is the meeting date + 1 at
-- 00:00 UTC, which renders as 5pm Pacific on the meeting day (see
-- `schedule-meeting`). The soonest meeting across every HIVE is 8 September, so
-- that is the date, and `getSurveyResponsePeriod` reads '2026-09' off it.
--
-- One row covering three HIVEs cannot carry three meeting dates, and it no
-- longer has to: the Arrival Board reads THIS HIVE's own next meeting to decide
-- whether its night is over, rather than reading this date. That was the bug
-- this file's sibling commit fixed, and it is why a single due date is now only
-- about which month an answer is filed under.

update public.surveys
   set due_date = '2026-09-09T00:00:00+00'
 where id = 'f3c4b7e1-7969-4d07-8922-d50f02eb1a19'
   and title = 'Before we meet'
   and community_id is null;

-- --------------------------------------------------------------------------
-- The answers
-- --------------------------------------------------------------------------

insert into public.survey_responses
  (survey_id, user_id, community_id, answers, submitted_at, response_period, share_scope)
select
  'f3c4b7e1-7969-4d07-8922-d50f02eb1a19'::uuid,
  r.user_id,
  s.community_id,
  r.answers,
  r.submitted_at,
  '2026-09',
  r.share_scope
from public.survey_responses r
join public.surveys s on s.id = r.survey_id
where s.community_id is not null
  and public.check_in_kind(s.title) = 'premeeting'
  and (
    -- Tech's first-meeting answers, which have no period of their own.
    (s.id = '3994747d-dc8e-4847-aa83-5c2b93a31cb2')
    -- OG's September answer. Earlier months stay where they are: they belong to
    -- meetings that have already happened.
    or (r.response_period = '2026-09')
  )
on conflict (survey_id, user_id, response_period, community_key) do nothing;

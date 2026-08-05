-- An answer can mean something
--
-- Nat, 2026-08-05: "if all HIVEs are getting different questions, will this
-- swarm report still show who you match with, even across different hives &
-- different types of questions? how smart are the analytics?"
--
-- The honest answer was no. The Swarm Report compared two people by counting
-- the words their answers had in common. That has two failures you cannot
-- patch by counting better:
--
--   "pizza" and "pasta"                    → zero words in common, scored apart
--   "I love my dog" and "I hate my dog"    → three words in common, scored together
--
-- One is the same answer wearing different words. The other is two people
-- disagreeing completely. Word overlap gets both backwards, and it gets them
-- backwards *confidently*, which is worse than getting them wrong quietly.
--
-- A language model can tell the difference. The naive way to use one is to ask
-- it to compare every pair of answers — which is one model call per pair, so
-- 200 answers is ~20,000 calls, and nobody is waiting that long to open a page.
--
-- So: ONE CALL PER ANSWER, not per pair. Each answer gets a small "gist"
-- computed once by `supabase/functions/distil-answers` and stored on its row.
-- Comparing two gists afterwards is arithmetic — set overlap on the concepts,
-- a check that the feelings point the same way — and that runs instantly on
-- the phone, for any number of members, across any number of HIVEs.
--
-- The gist is written once and kept. `gist_at` says when, so a later run can
-- find rows distilled by an older prompt and redo them without redoing the
-- whole table.

alter table public.daily_question_answers
  add column if not exists gist jsonb,
  add column if not exists gist_at timestamptz;

comment on column public.daily_question_answers.gist is
  $$What this answer is ABOUT, distilled once by Claude so two people can be
matched across HIVEs that ask completely different questions. Null until
distilled; the nightly distil-answers job fills it in.

  {
    "concepts": ["italian food", "comfort", "family dinner"],
    "sentiment": "positive",
    "intensity": 3
  }

concepts  — up to 6 short lowercase noun phrases: the thing being talked
            about, not the words used. This is what lets "pizza" and "pasta"
            meet. Normalised, so two people who mean the same thing land on
            the same phrase.
sentiment — one of positive | negative | mixed | neutral. This is what keeps
            "I love my dog" and "I hate my dog" apart when their concepts are
            identical.
intensity — 1 to 5, how strongly they feel it. A quiet yes and a shouted yes
            are both a yes, and this is how you tell them apart.

Never half-written. A malformed reply from the model leaves this null and the
next night tries again, because a missing gist fixes itself and a wrong one
never does.$$;

comment on column public.daily_question_answers.gist_at is
  'When the gist was computed. Lets a re-run find answers distilled by an older prompt without re-distilling every row.';

-- The one question the nightly job asks: which answers have no gist yet, and
-- which are oldest? A partial index means it only carries the rows still
-- waiting, so it shrinks to nothing as the backlog drains.
create index if not exists daily_question_answers_awaiting_gist_idx
  on public.daily_question_answers (created_at)
  where gist is null;


-- The schedule
--
-- Copied from migration 132, deliberately and exactly: the secret is NAMED,
-- never written into the command, and it is the **sb_secret_...** key stored
-- in Vault as 'service_role_key' — NOT the legacy service_role JWT. That
-- distinction cost a round trip in 132; the JWT looks right from every angle
-- and gets a silent 403.
--
-- If the secret is missing, this posts an empty Authorization header and the
-- function refuses it. That is the right way round to fail.
--
-- 2am Pacific — after seal-meeting-nightly (9pm Pacific) and well before
-- check-in-reminder-daily (9am Pacific), so the three jobs never overlap. The
-- function takes a fixed batch and stops, so a backlog drains over several
-- nights instead of timing out on the first one.

select cron.unschedule('distil-answers-nightly')
where exists (select 1 from cron.job where jobname = 'distil-answers-nightly');

select cron.schedule(
  'distil-answers-nightly',
  '0 9 * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/distil-answers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);

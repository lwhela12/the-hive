-- ============================================================================
-- 192 — the calendar decides when to import
-- ============================================================================
--
-- Nat, 2026-08-19, on the hourly Meet-transcript poll: "we def dont need any
-- sort of job that runs once an hour... you could just look at my calendar,
-- see when these meetings are scheduled & know when to ingest."
--
-- She is right. The old job (`import-meet-transcripts-hourly`, created straight
-- against the live database on 2026-08-19, never checked in) asked Google Drive
-- for new transcripts at 17 past every hour of every day, on a calendar where a
-- Google Meet HIVE meeting happens once a month. It also carried the raw
-- service key written into its own command string, which migration 132 exists
-- to forbid — the key belongs in Vault, read at call time.
--
-- The replacement reads the meetings calendar the same way the nightly seal
-- does (migration 151): the job's own subquery asks `events` whether a HIVE
-- that meets on Google Meet has a meeting whose scheduled start was within the
-- last six hours. No such meeting → the subquery returns no rows → not a single
-- HTTP call is made, exactly the property 151 relies on ("a HIVE with no
-- meeting yesterday is never called at all").
--
-- Why a six-hour window after the start, checked every twenty minutes, instead
-- of one shot at meeting-end: Google Meet publishes the transcript document
-- asynchronously, usually ten to sixty minutes after the call ends and
-- sometimes later. One fixed shot would miss a slow publish; the window
-- catches it whenever it lands, and `meet_transcript_imports`' unique
-- document_id makes every repeat run a no-op. A 6pm meeting is checked from
-- 6:20pm to midnight Pacific and never again — which also puts the transcript
-- on the meeting's row before the 9pm seal writes the summary, whenever Google
-- publishes in time.
--
-- The date arithmetic treats `event_time` as Pacific via the same fixed
-- now-minus-seven-hours the seal job and `pacificToday()` use. `event_time`
-- can be null (an all-day row); 17:00 stands in for it, the evening hour every
-- HIVE actually meets at.
--
-- `body := {"days": 2}` keeps the Drive search to documents created in the
-- last two days — the import is now always running close to the meeting it is
-- looking for, so the 14-day default lookback is more Drive than it needs.

select cron.unschedule('import-meet-transcripts-hourly')
where exists (select 1 from cron.job where jobname = 'import-meet-transcripts-hourly');

select cron.schedule(
  'import-meet-transcripts-after-a-meeting',
  '*/20 * * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/import-meet-transcripts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"days": 2}'::jsonb
  )
  from (
    select 1
    from public.events e
    join public.communities c on c.id = e.community_id
    where e.event_type = 'meeting'
      and c.meets_on_google_meet
      and coalesce(e.status, 'scheduled') <> 'cancelled'
      and (e.event_date + coalesce(e.event_time, time '17:00'))
          between ((now() at time zone 'utc') - interval '7 hours') - interval '6 hours'
              and ((now() at time zone 'utc') - interval '7 hours')
    limit 1
  ) due;
  $job$
);

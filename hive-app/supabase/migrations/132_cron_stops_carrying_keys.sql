-- The nightly jobs stop carrying keys in their pockets
--
-- Two problems, one fix.
--
-- FIRST, a regression I caused. Closing check-in-reminder on 2026-08-03 made it
-- require the service key — and the cron that calls it every morning was sending
-- the ANON key. So the job that fires at 9am Pacific would have started
-- answering 403 tonight, silently, and the month-end check-in that feeds the
-- newsletter would simply have stopped arriving. Nobody would have noticed until
-- the emails didn't come.
--
-- SECOND, seal-meeting-nightly had the service secret written out in full inside
-- its command. cron.job is readable only by postgres, so this was never as open
-- as it looked — but a key in a command string is a key that leaks the first
-- time somebody pastes a job definition into a chat window to ask why it broke.
--
-- Both now read from Vault at call time. The secret is named, never written.

-- The secret itself was created outside this file, because a migration is a
-- thing you check into git and a key is not:
--
--   select vault.create_secret('<key>', 'service_role_key', '...');
--
-- WHICH KEY, because this cost me a round trip: it must be the **sb_secret_...**
-- key, NOT the legacy service_role JWT. Those are two different strings, and
-- SUPABASE_SERVICE_ROLE_KEY inside an edge function holds the sb_secret one. I
-- put the JWT in first and the cron kept getting 403 while looking correct from
-- every angle. Verified by calling the function with each in turn.
--
-- If you are rebuilding this database from scratch, create it first or these
-- two jobs will post an empty Authorization header and fail closed, which is
-- the right way round to fail.

select cron.unschedule('check-in-reminder-daily');
select cron.unschedule('seal-meeting-nightly');

-- 9am Pacific. Asks the function every morning; the function decides whether
-- today is actually three days before a meeting.
select cron.schedule(
  'check-in-reminder-daily',
  '0 16 * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/check-in-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 9pm Pacific. Only seals on a day that actually had a meeting — the guard
-- matters more than the schedule (see the 2026-07-25 receipt).
select cron.schedule(
  'seal-meeting-nightly',
  '0 4 * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/seal-meeting',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"communityId":"e38d99a8-3aa8-4ace-8381-e56bb9991cf9"}'::jsonb
  );
  $job$
);

-- Worth saying out loud: seal-meeting-nightly still names OG HIVE's id directly.
-- That was fine when there was one HIVE. With three it means Tech HIVE and
-- Production HIVE never seal a meeting at all, so their summaries stay blank
-- however many meetings they hold. Not fixed here because it belongs with the
-- per-HIVE cadence work, which is still open.

-- The check-in preview arrives at 6am Pacific, including across DST.
--
-- pg_cron runs in UTC. It wakes at both possible UTC equivalents of 6am in
-- Los Angeles, and the SQL guard permits exactly the candidate that is truly
-- in the 6am Pacific hour. The service credential remains in Vault.

select cron.unschedule('check-in-reminder-daily');

select cron.schedule(
  'check-in-reminder-daily',
  '0 13,14 * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/check-in-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  )
  where extract(hour from (now() at time zone 'America/Los_Angeles')) = 6;
  $job$
);

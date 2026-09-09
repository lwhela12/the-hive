-- Nat, 2026-09-08: approved check-in templates create a preview for her on
-- the day before and the day of a meeting. This job emails NAT ONLY. Members
-- receive nothing unless she follows the Yes, send it link in that preview.
--
-- 16:00 UTC is 9am Pacific during daylight saving, matching the existing
-- HIVE morning jobs. The handler itself does all date math in Los Angeles.
select cron.schedule(
  'check-in-preview-daily',
  '0 16 * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/check-in-preview',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);

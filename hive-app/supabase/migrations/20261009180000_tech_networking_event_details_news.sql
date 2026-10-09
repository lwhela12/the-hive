-- Member-facing log entry for the Tech-only networking event form.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-10-09',
  'Tech HIVE can add networking events with their info links',
  'In Meeting Helper, choose HIVE Networking and a date. Save the event name, time, focus, cost, location and info link; find it on Tech HIVE Home.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
  and not exists (
    select 1 from public.app_news n
    where n.title = 'Tech HIVE can add networking events with their info links'
  )
limit 1;

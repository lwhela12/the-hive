-- Normalize legacy meeting copy from "Hive" to the official HIVE brand.

update public.events
set title = replace(replace(title, 'The Hive', 'HIVE'), 'Hive', 'HIVE')
where event_type = 'meeting'
  and (title like '%Hive%' or title like '%The Hive%');

update public.meetings
set summary = replace(replace(summary, 'The Hive Meeting', 'HIVE Meeting'), 'Hive Meeting', 'HIVE Meeting')
where summary like '%Hive Meeting%'
   or summary like '%The Hive Meeting%';

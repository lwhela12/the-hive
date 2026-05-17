-- Normalize legacy mixed-case meeting copy to the official HIVE brand.

update public.events
set title = replace(replace(title, 'The ' || 'Hi' || 've', 'HIVE'), 'Hi' || 've', 'HIVE')
where event_type = 'meeting'
  and (title like '%' || 'Hi' || 've' || '%' or title like '%' || 'The ' || 'Hi' || 've' || '%');

update public.meetings
set summary = replace(replace(summary, 'The ' || 'Hi' || 've Meeting', 'HIVE Meeting'), 'Hi' || 've Meeting', 'HIVE Meeting')
where summary like '%' || 'Hi' || 've Meeting' || '%'
   or summary like '%' || 'The ' || 'Hi' || 've Meeting' || '%';

insert into public.app_news (occurred_on,title,detail,created_by)
select date '2026-10-28',
 'See who is coming at a glance',
 'Meeting Helper and the Arrival Board group people by In person, Remote, Not coming, and Not checked in, with attendance totals and matching tile labels.',
 id from public.profiles
where id='d85dd42e-81fc-4b4c-8f3a-b2cf39c76359' and is_owner=true
 and not exists(select 1 from public.app_news where occurred_on=date '2026-10-28' and title='See who is coming at a glance');

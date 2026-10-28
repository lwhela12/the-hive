-- Keep the shared meeting deck separate from Nat's private feedback tools.
insert into public.app_news (occurred_on,title,detail,created_by)
select date '2026-10-28',
 'Private check-in feedback is in Admin',
 'Nat can open private check-in feedback from Admin. Its shortcut has been removed from the shared Meeting Helper.',
 id
from public.profiles
where id='d85dd42e-81fc-4b4c-8f3a-b2cf39c76359' and is_owner=true
 and not exists(select 1 from public.app_news where occurred_on=date '2026-10-28' and title='Private check-in feedback is in Admin');

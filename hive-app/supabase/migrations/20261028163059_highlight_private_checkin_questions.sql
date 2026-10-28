-- Record the private-question visual update alongside its UI release.
insert into public.app_news (occurred_on, title, detail, created_by)
select date '2026-10-28',
  'You can spot every Just for Nat question in your check-in',
  'All four private questions have a highlighted card and a lock label. Only you and Nat can read these answers.',
  profile.id
from public.profiles profile
where profile.id = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359'
  and profile.is_owner = true
  and not exists (
    select 1 from public.app_news
    where occurred_on = date '2026-10-28'
      and title = 'You can spot every Just for Nat question in your check-in'
  );

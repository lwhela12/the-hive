insert into public.app_news(occurred_on, title, detail, created_by)
select '2026-10-28', 'Follow each person’s wishes and progress in OG HIVE Meeting Helper', 'Open a person’s HummDinger tile to review wish history, help given and received, current wishes and next steps. Save spoken updates during the meeting and find them again next time.', id
from public.profiles where lower(email) = 'natwalstead@gmail.com';

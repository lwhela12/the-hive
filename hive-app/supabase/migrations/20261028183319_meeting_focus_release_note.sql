-- Replace the earlier dense-story announcement with the corrected live behavior.
update public.app_news set title='A simpler OG HIVE HummDinger',
 detail='Open a person’s tile for their selected check-in wish, a short progress update and one next step. Closing a wish retires unfinished linked to-dos without marking them done. Duplicate yarn asks have been consolidated.'
where occurred_on='2026-10-28' and title='Follow each person’s wishes and progress in OG HIVE Meeting Helper';

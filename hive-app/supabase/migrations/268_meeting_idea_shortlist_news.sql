-- The meeting deck can show Nat's picks without presenting them as member votes.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-23',
  'The Meeting Helper shows Nat’s picks beside the group’s votes',
  'Open HIVE Help or HIVE Hang on Plan the Meet Ups. Nat can edit her picks there for that meeting. Drafted by Codex on Nat’s behalf.',
  owner.id
from (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1 from public.app_news existing
  where existing.occurred_on = date '2026-09-23'
    and existing.title = 'The Meeting Helper shows Nat’s picks beside the group’s votes'
);

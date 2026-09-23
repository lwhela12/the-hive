-- Member-facing note for the restored OG HIVE idea choices.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-23',
  'You can choose or suggest a HIVE Help or Hang idea before we meet',
  'Open OG HIVE’s Before we meet check-in to add an idea or vote for one. The Meeting Helper shows the votes when the group makes its plan. Drafted by Codex on Nat’s behalf.',
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
    and existing.title = 'You can choose or suggest a HIVE Help or Hang idea before we meet'
);

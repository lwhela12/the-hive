-- Member-facing release note for the Boards scope control. The choice is a
-- per-person display preference; board reach and access remain unchanged.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-10-09',
  'Choose which Boards you see',
  'Use All boards for your HIVE’s boards plus shared boards, or This HIVE when you want to focus close to home.',
  owner.id
from (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1
  from public.app_news existing
  where existing.occurred_on = date '2026-10-09'
    and existing.title = 'Choose which Boards you see'
);

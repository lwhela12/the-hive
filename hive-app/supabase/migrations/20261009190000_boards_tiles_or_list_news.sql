-- Member-facing release note for the two Board display choices. The chosen
-- view itself stays on each person's device, beside their existing sort choice.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-10-09',
  'Choose how your Boards look',
  'Use the Tiles or List button on Boards to see the same boards the way that is easiest to scan.',
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
    and existing.title = 'Choose how your Boards look'
);

-- Member-facing release note: board posts and replies are now usable source
-- material, not locked display text.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-10-09',
  'Copy what you need from Boards',
  'Select and copy a board post or reply when you want to reuse a prompt, link, or helpful detail.',
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
    and existing.title = 'Copy what you need from Boards'
);

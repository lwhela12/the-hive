-- The Boards grid can be sorted without changing the boards or their threads.
-- App news lives in the database now, so announce the member-visible change
-- here rather than adding a new row to the frozen TypeScript history.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-06',
  'Put your boards in the order that helps you',
  'Sort Boards A–Z, by recent or oldest activity, or by which board has the most threads.',
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
  where existing.occurred_on = date '2026-09-06'
    and existing.title = 'Put your boards in the order that helps you'
);

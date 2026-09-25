-- Meeting Helper: the room sees the presenter's open cards and choices, and
-- pacing counts down to the first relevant hard out.
insert into public.app_news (occurred_on, title, detail, created_by)
select date '2026-09-25', item.title, item.detail, owner.id
from (
  values
    ('The room can follow the details you open in Meeting Helper',
     'When someone presents, your screen follows their Honey choices and opened HD or check-in cards, including the screen on the TV.'),
    ('Meeting Helper pace now follows the first hard out',
     'The time per slide updates from the earliest leaving time shared in the current check-in, while the HIVE keeps its own meeting end.')
) as item(title, detail)
cross join lateral (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1 from public.app_news existing
  where existing.occurred_on = date '2026-09-25'
    and existing.title = item.title
);

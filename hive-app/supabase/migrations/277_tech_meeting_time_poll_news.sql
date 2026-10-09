-- Member-facing release note for Tech HIVE's next-meeting availability poll.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-10-09',
  'Tech HIVE members can help choose the next meeting time',
  'In Before we meet, mark the times you can make and pick a favorite. You can vote even if you will miss this meeting. Nat can see the totals in Meeting Helper. Drafted by Codex on Nat’s behalf.',
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
  where existing.occurred_on = date '2026-10-09'
    and existing.title = 'Tech HIVE members can help choose the next meeting time'
);

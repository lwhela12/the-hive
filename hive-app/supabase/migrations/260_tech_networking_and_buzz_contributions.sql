-- Two pieces of already-settled HIVE work that were still only living on the
-- punch list.
--
-- 1. Tech HIVE asked for one obvious place to share conferences, meetups,
--    talks, demo nights and other rooms worth being in. This is a Tech board,
--    not a second calendar: members can discuss an opportunity here and put
--    the actual date on Home when it becomes a plan.
-- 2. Members can now put shout-outs and event plugs into End of the month and
--    see/edit those contributions on Nat's Buzz worktop. Tell them that once,
--    through the app's living news ledger rather than deploy-only copy.

insert into public.board_categories (
  community_id,
  name,
  description,
  category_type,
  icon,
  display_order,
  is_system,
  requires_admin,
  requires_approval,
  audience,
  topic_kind,
  status,
  reach,
  created_by
)
select
  c.id,
  'Networking Events',
  'Conferences, meetups, talks, demo nights and other rooms Tech HIVE might want to know about. Share the link and why it is worth someone''s time.',
  'custom',
  '🤝',
  70,
  false,
  false,
  false,
  'community',
  'discussion',
  'active',
  'hive',
  p.id
from public.communities c
join public.profiles p on lower(p.email) = 'natwalstead@gmail.com'
where c.slug = 'tech'
  and not exists (
    select 1
    from public.board_categories existing
    where existing.community_id = c.id
      and lower(existing.name) = 'networking events'
      and coalesce(existing.status, 'active') <> 'archived'
  )
limit 1;

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-09',
  'Your shout-outs and plugs can go straight into The Buzz',
  'Add one in End of the month. It stays private while Nat reviews the letter, and you can see what you sent from The Buzz.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
  and not exists (
    select 1
    from public.app_news n
    where n.title = 'Your shout-outs and plugs can go straight into The Buzz'
  )
limit 1;

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-09',
  'Your whole HIVE year has one calendar now',
  'Open Year beside Upcoming Events on Home. It shows the next 12 months, including every birthday in your HIVE even when birthdays are hidden from the short list.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
  and not exists (
    select 1
    from public.app_news n
    where n.title = 'Your whole HIVE year has one calendar now'
  )
limit 1;

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-09',
  'Tech HIVE has a Networking Events board',
  'Share conferences, meetups, talks, demo nights and other rooms worth knowing about. Add the link and why it might be worth someone''s time.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
  and not exists (
    select 1
    from public.app_news n
    where n.title = 'Tech HIVE has a Networking Events board'
  )
limit 1;

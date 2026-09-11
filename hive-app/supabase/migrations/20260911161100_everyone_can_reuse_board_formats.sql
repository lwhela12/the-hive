-- Nat, 2026-09-11: a pinned "Start here" post is a shared template, not an
-- owner-only editing trick. Every member who can post can now open a fresh
-- thread with that format already filled in.

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-11',
  'Start a board thread from the shared format',
  'Tap Use this format on a pinned Start here post. A fresh thread opens with the structure ready for your project.',
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
  where existing.occurred_on = date '2026-09-11'
    and existing.title = 'Start a board thread from the shared format'
);

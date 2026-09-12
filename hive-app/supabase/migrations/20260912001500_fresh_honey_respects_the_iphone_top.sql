-- Izzy, relayed by Nat, 2026-09-11: the fresh-version notice first opened
-- beneath the top of her iPhone. Rotation forced a correct measurement. The
-- shared banner now has a CSS safe-area fallback from its first frame.

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-12',
  'The update bar stays below your iPhone clock',
  'The fresh-honey notice and its close button stay reachable in portrait and landscape.',
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
  where existing.title = 'The update bar stays below your iPhone clock'
);

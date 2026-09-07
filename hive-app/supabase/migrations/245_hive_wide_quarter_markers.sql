-- Quarter boundaries are useful to every HIVE even though quarterly dues are
-- currently an OG HIVE rule. Keep the two ideas separate: these are neutral,
-- all-day calendar markers. The end-of-month / 3MIQ survey can learn its own
-- quarter-ending questions later without making the calendar depend on it.
--
-- Events still require an owning community, so OG owns the rows operationally;
-- both reach columns are HIVE-Wide, which is the member-facing truth.

with quarter_markers(title, event_date) as (
  values
    ('Q3 2026 ends', date '2026-09-30'),
    ('Q4 2026 begins', date '2026-10-01'),
    ('Q4 2026 ends', date '2026-12-31'),
    ('Q1 2027 begins', date '2027-01-01'),
    ('Q1 2027 ends', date '2027-03-31'),
    ('Q2 2027 begins', date '2027-04-01'),
    ('Q2 2027 ends', date '2027-06-30'),
    ('Q3 2027 begins', date '2027-07-01'),
    ('Q3 2027 ends', date '2027-09-30'),
    ('Q4 2027 begins', date '2027-10-01'),
    ('Q4 2027 ends', date '2027-12-31')
),
owner_hive as (
  select id
  from public.communities
  where slug = 'default'
  order by created_at
  limit 1
),
creator as (
  select id
  from public.profiles
  where is_owner = true
  order by created_at
  limit 1
)
insert into public.events (
  title,
  description,
  event_date,
  event_type,
  community_id,
  created_by,
  visibility,
  invited_scope,
  status
)
select
  marker.title,
  'HIVE-Wide quarter marker.',
  marker.event_date,
  'custom'::public.event_type,
  owner_hive.id,
  creator.id,
  'all_hives',
  'all_hives',
  'scheduled'
from quarter_markers marker
cross join owner_hive
left join creator on true
where not exists (
  select 1
  from public.events existing
  where existing.title = marker.title
    and existing.event_date = marker.event_date
    and existing.visibility = 'all_hives'
);

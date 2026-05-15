-- Add HD boards that use community nicknames rather than profile first names.

with requested_boards(alias_name, profile_match, goal_title, description, icon, ordinal) as (
  values
    ('Brit', 'brittany', 'sexy photo shoot photographer recs and contact info', 'Brit is looking for recommendations and contact info for photographers who would be good for a sexy photo shoot.', '📷', 12),
    ('Izzy', 'isabelle', 'weed recs', 'Izzy is looking for weed recommendations; terpene knowledge is especially welcome.', '🌿', 13)
),
matched_members as (
  select distinct on (memberships.community_id, requested_boards.alias_name, requested_boards.goal_title)
    memberships.community_id,
    profiles.id as owner_user_id,
    requested_boards.alias_name,
    requested_boards.goal_title,
    requested_boards.description,
    requested_boards.icon,
    requested_boards.ordinal
  from requested_boards
  join public.profiles profiles
    on lower(split_part(trim(profiles.name), ' ', 1)) = requested_boards.profile_match
  join public.community_memberships memberships
    on memberships.user_id = profiles.id
  order by memberships.community_id, requested_boards.alias_name, requested_boards.goal_title, profiles.created_at
),
upserted as (
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
    created_by,
    topic_kind,
    goal_title,
    owner_user_id,
    audience,
    status,
    completed_at,
    completed_by,
    completion_note
  )
  select
    matched_members.community_id,
    matched_members.alias_name || '''s HD: ' || matched_members.goal_title,
    matched_members.description,
    'custom',
    matched_members.icon,
    matched_members.ordinal,
    false,
    false,
    false,
    null,
    'hd_board',
    matched_members.goal_title,
    matched_members.owner_user_id,
    'members',
    'active',
    null,
    null,
    null
  from matched_members
  on conflict (community_id, name) do update
  set
    description = excluded.description,
    icon = excluded.icon,
    topic_kind = 'hd_board',
    goal_title = excluded.goal_title,
    owner_user_id = excluded.owner_user_id,
    audience = 'members',
    status = 'active',
    completed_at = null,
    completed_by = null,
    completion_note = null
  returning id, community_id, owner_user_id
)
insert into public.board_category_member_tags (
  community_id,
  category_id,
  tagged_user_id,
  tagged_by
)
select
  upserted.community_id,
  upserted.id,
  upserted.owner_user_id,
  null
from upserted
on conflict (category_id, tagged_user_id) do nothing;

-- Archive the older blended Nic board now that the dog-training and body-double asks are split.
update public.board_categories
set
  status = 'archived',
  completion_note = coalesce(completion_note, 'Archived after Nic''s dog-training and body-double asks were split into clearer HD boards.'),
  completed_at = coalesce(completed_at, now())
where name = 'Nic''s HD: Dog training body doubling'
  and topic_kind = 'hd_board';

-- Re-rank active boards after adding the alias boards.
with ranked as (
  select
    category.id,
    row_number() over (
      partition by category.community_id
      order by
        case
          when category.topic_kind = 'hd_board' then 0
          when category.topic_kind = 'helper_log' then 1
          when category.category_type = 'announcements' then 2
          when category.category_type = 'general' then 3
          when category.category_type = 'resources' or category.name = 'HIVE Approved' then 4
          else 5
        end,
        case when category.topic_kind = 'hd_board' then coalesce(owner.name, category.name) else category.name end,
        category.display_order,
        category.created_at
    ) * 10 as display_order
  from public.board_categories category
  left join public.profiles owner on owner.id = category.owner_user_id
  where category.status = 'active'
)
update public.board_categories category
set display_order = ranked.display_order
from ranked
where category.id = ranked.id;

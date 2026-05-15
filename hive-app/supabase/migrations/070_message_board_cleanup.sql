-- Clean up board clutter, preserve old content, and seed the next HD/to-do set.

-- Future communities should start with the lean board set.
create or replace function create_default_board_categories()
returns trigger as $$
begin
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
    topic_kind,
    goal_title,
    audience,
    status
  )
  values
    (NEW.id, 'Announcements', 'Important updates from admins', 'announcements', '1F4E2', 10, true, true, false, 'discussion', null, 'community', 'active'),
    (NEW.id, 'General Discussion', 'Open conversations about anything', 'general', '1F4AC', 20, true, false, false, 'discussion', null, 'community', 'active'),
    (NEW.id, 'HIVE Approved', 'Community-approved recommendations: favorite brands, stores, service providers, places, and trusted local gems.', 'resources', '🏆', 30, true, false, false, 'discussion', null, 'community', 'active'),
    (NEW.id, '15min HIVE Helpers', 'Log quick acts of help so Clive can include them in meeting recaps, slide decks, and newsletters.', 'custom', '🤝', 40, false, false, false, 'helper_log', '15min HIVE Helpers', 'community', 'active')
  on conflict (community_id, name) do nothing;

  return NEW;
end;
$$ language plpgsql security definer;

-- Preserve introductions by moving the latest intro post into profile bio when bio is blank.
with latest_intro as (
  select distinct on (bp.author_id)
    bp.author_id,
    bp.content
  from public.board_posts bp
  join public.board_categories bc on bc.id = bp.category_id
  where bc.category_type = 'introductions'
    and nullif(trim(bp.content), '') is not null
  order by bp.author_id, bp.created_at desc
)
update public.profiles profile
set
  bio = latest_intro.content,
  updated_at = now()
from latest_intro
where profile.id = latest_intro.author_id
  and nullif(trim(coalesce(profile.bio, '')), '') is null;

-- Turn Resources into HIVE Approved, or merge Resources into an existing HIVE Approved board.
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
  topic_kind,
  goal_title,
  audience,
  status
)
select
  communities.id,
  'HIVE Approved',
  'Community-approved recommendations: favorite brands, stores, service providers, places, and trusted local gems.',
  'resources',
  '🏆',
  30,
  true,
  false,
  false,
  'discussion',
  null,
  'community',
  'active'
from public.communities communities
where not exists (
  select 1
  from public.board_categories existing
  where existing.community_id = communities.id
    and existing.name = 'HIVE Approved'
);

update public.board_categories resources
set
  name = 'HIVE Approved',
  description = 'Community-approved recommendations: favorite brands, stores, service providers, places, and trusted local gems.',
  icon = '🏆',
  status = 'active',
  topic_kind = 'discussion',
  goal_title = null,
  audience = 'community',
  display_order = 30
where lower(resources.name) = 'resources'
  and not exists (
    select 1
    from public.board_categories approved
    where approved.community_id = resources.community_id
      and approved.name = 'HIVE Approved'
      and approved.id <> resources.id
  );

with approved as (
  select community_id, id
  from public.board_categories
  where name = 'HIVE Approved'
),
old_resources as (
  select community_id, id
  from public.board_categories
  where lower(name) = 'resources'
)
update public.board_posts post
set category_id = approved.id
from approved, old_resources
where post.community_id = approved.community_id
  and old_resources.community_id = approved.community_id
  and post.category_id = old_resources.id;

update public.board_categories
set
  status = 'archived',
  completion_note = coalesce(completion_note, 'Archived after Resources was consolidated into HIVE Approved.'),
  completed_at = coalesce(completed_at, now())
where lower(name) = 'resources';

update public.board_categories
set
  description = 'Community-approved recommendations: favorite brands, stores, service providers, places, and trusted local gems.',
  icon = '🏆',
  status = 'active',
  topic_kind = 'discussion',
  audience = 'community',
  goal_title = null
where name = 'HIVE Approved';

-- Archive boards that are now historical or owned by better surfaces.
update public.board_categories
set
  status = 'archived',
  completion_note = case
    when category_type = 'introductions' then coalesce(completion_note, 'Archived after introduction details moved to member profiles.')
    when category_type = 'queen_bee' then coalesce(completion_note, 'Archived; Clive can still reference these posts for historical Queen Bee context.')
    else coalesce(completion_note, 'Archived during board cleanup.')
  end,
  completed_at = coalesce(completed_at, now())
where category_type in ('introductions', 'queen_bee')
  or lower(name) in ('introductions', 'queen bee updates')
  or lower(name) like '%hive meeting%resource%';

-- Merge obvious General Discussion duplicates into the system board, then archive the duplicate shells.
with canonical_general as (
  select distinct on (community_id)
    community_id,
    id
  from public.board_categories
  where lower(name) = 'general discussion'
  order by community_id, is_system desc, created_at
),
duplicate_general as (
  select
    duplicate.id,
    duplicate.community_id,
    canonical_general.id as canonical_id
  from public.board_categories duplicate
  join canonical_general on canonical_general.community_id = duplicate.community_id
  where duplicate.id <> canonical_general.id
    and lower(duplicate.name) in ('general', 'general discussion', 'general discussions')
)
update public.board_posts post
set category_id = duplicate_general.canonical_id
from duplicate_general
where post.category_id = duplicate_general.id;

with canonical_general as (
  select distinct on (community_id)
    community_id,
    id
  from public.board_categories
  where lower(name) = 'general discussion'
  order by community_id, is_system desc, created_at
)
update public.board_categories duplicate
set
  status = 'archived',
  completion_note = coalesce(completion_note, 'Archived after duplicate General Discussion posts were consolidated.'),
  completed_at = coalesce(completed_at, now())
from canonical_general
where duplicate.community_id = canonical_general.community_id
  and duplicate.id <> canonical_general.id
  and lower(duplicate.name) in ('general', 'general discussion', 'general discussions');

-- Add the missing HD boards.
with requested_boards(first_name, goal_title, description, icon, ordinal) as (
  values
    ('lucas', 'video shoots/collaboration request', 'Lucas is looking for people to collaborate on video shoots and creative production.', '🎬', 10),
    ('lucas', 'lawyer referrals for his business', 'Lucas is looking for lawyer referrals for his business, especially personal injury or workers comp, though any useful referral is welcome.', '⚖️', 11),
    ('brit', 'sexy photo shoot photographer recs and contact info', 'Brit is looking for recommendations and contact info for photographers who would be good for a sexy photo shoot.', '📷', 12),
    ('izzy', 'weed recs', 'Izzy is looking for weed recommendations; terpene knowledge is especially welcome.', '🌿', 13),
    ('nic', 'dog training accountability buddy', 'Nic wants an accountability buddy for dog training.', '🐾', 14),
    ('nic', 'body-double work sessions', 'Nic is in WA and focuses better when she can set a Google Meet or FaceTime and silently work next to someone.', '💻', 15)
),
matched_members as (
  select distinct on (memberships.community_id, requested_boards.first_name, requested_boards.goal_title)
    memberships.community_id,
    profiles.id as owner_user_id,
    profiles.name,
    requested_boards.goal_title,
    requested_boards.description,
    requested_boards.icon,
    requested_boards.ordinal
  from requested_boards
  join public.profiles profiles
    on lower(split_part(trim(profiles.name), ' ', 1)) = requested_boards.first_name
  join public.community_memberships memberships
    on memberships.user_id = profiles.id
  order by memberships.community_id, requested_boards.first_name, requested_boards.goal_title, profiles.created_at
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
    split_part(trim(matched_members.name), ' ', 1) || '''s HD: ' || matched_members.goal_title,
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

-- Make sure every community still has the helper board.
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
  audience,
  status
)
select
  communities.id,
  '15min HIVE Helpers',
  'Log quick acts of help so Clive can include them in meeting recaps, slide decks, and newsletters.',
  'custom',
  '🤝',
  90,
  false,
  false,
  false,
  null,
  'helper_log',
  '15min HIVE Helpers',
  'community',
  'active'
from public.communities communities
on conflict (community_id, name) do update
set
  description = excluded.description,
  icon = excluded.icon,
  topic_kind = 'helper_log',
  goal_title = '15min HIVE Helpers',
  audience = 'community',
  status = 'active';

-- Put active HD boards first, then the helper log, then the standing boards.
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

-- Seed shared follow-up tasks for each member. These are intentionally text-only; the task tells people where to log the result.
with task_templates(description) as (
  values
    ('Do one 15-minute HIVE helper for someone and log what happened on the 15min HIVE Helpers board.'),
    ('Add one favorite recommendation to HIVE Approved: a brand, store, beauty person, handyman, bar, club, or other trusted local gem.'),
    ('Schedule a front-door practice visit with Charlee for dog front-door manners help.'),
    ('Schedule a one-hour body-double session with Nic over Google Meet or FaceTime.'),
    ('Share a photographer recommendation for Brit''s sexy photo shoot HD board if you know one.'),
    ('Share a lawyer referral for Lucas''s business on his personal injury/workers comp HD board if you have one.')
),
member_tasks as (
  select
    memberships.community_id,
    memberships.user_id,
    task_templates.description
  from public.community_memberships memberships
  cross join task_templates
)
insert into public.action_items (
  meeting_id,
  community_id,
  description,
  assigned_to,
  due_date,
  completed
)
select
  null,
  member_tasks.community_id,
  member_tasks.description,
  member_tasks.user_id,
  null,
  false
from member_tasks
where not exists (
  select 1
  from public.action_items existing
  where existing.community_id = member_tasks.community_id
    and existing.assigned_to = member_tasks.user_id
    and existing.description = member_tasks.description
    and existing.archived_at is null
);

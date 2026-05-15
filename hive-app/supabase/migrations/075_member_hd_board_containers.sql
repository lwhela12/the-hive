-- Restructure HD boards so each member has one top-level HD board,
-- with individual asks living as board threads inside that member board.

create or replace function public.hive_hd_display_name(member_name text)
returns text as $$
  select coalesce(
    case lower(split_part(trim(coalesce(member_name, '')), ' ', 1))
      when 'brittany' then 'Brit'
      when 'isabelle' then 'Izzy'
      when 'infiniti' then 'Fin'
      when 'natalie' then 'Nat'
      when 'nathan' then 'Nat'
      when 'nicole' then 'Nic'
      when 'nicholas' then 'Nic'
      else null
    end,
    nullif(split_part(trim(coalesce(member_name, '')), ' ', 1), ''),
    'Member'
  );
$$ language sql immutable;

create or replace function public.ensure_member_hd_board(c_id uuid, member_id uuid)
returns uuid as $$
declare
  member_name text;
  display_name text;
  board_id uuid;
begin
  select name into member_name
  from public.profiles
  where id = member_id;

  if member_name is null then
    return null;
  end if;

  display_name := public.hive_hd_display_name(member_name);

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
    completion_note,
    source_wish_id
  )
  values (
    c_id,
    display_name || '''s HD Board',
    display_name || '''s home base for HD wishes, asks, updates, recommendations, and helper threads.',
    'custom',
    '💎',
    0,
    false,
    false,
    false,
    null,
    'hd_board',
    null,
    member_id,
    'members',
    'active',
    null,
    null,
    null,
    null
  )
  on conflict (community_id, name) do update
  set
    description = excluded.description,
    topic_kind = 'hd_board',
    goal_title = null,
    owner_user_id = excluded.owner_user_id,
    audience = 'members',
    status = 'active',
    completed_at = null,
    completed_by = null,
    completion_note = null,
    source_wish_id = null
  returning id into board_id;

  insert into public.board_category_member_tags (
    community_id,
    category_id,
    tagged_user_id,
    tagged_by
  )
  values (c_id, board_id, member_id, null)
  on conflict (category_id, tagged_user_id) do nothing;

  return board_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.ensure_member_hd_board_on_membership()
returns trigger as $$
begin
  perform public.ensure_member_hd_board(NEW.community_id, NEW.user_id);
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists auto_create_member_hd_board on public.community_memberships;
create trigger auto_create_member_hd_board
  after insert on public.community_memberships
  for each row execute function public.ensure_member_hd_board_on_membership();

-- Create one HD board for every current member.
select public.ensure_member_hd_board(membership.community_id, membership.user_id)
from public.community_memberships membership;

-- If an old per-ask HD board has no posts, create a thread for its ask before archiving it.
with old_hd as (
  select
    old_category.*,
    member_board.id as member_board_id
  from public.board_categories old_category
  join public.board_categories member_board
    on member_board.community_id = old_category.community_id
   and member_board.topic_kind = 'hd_board'
   and member_board.owner_user_id = old_category.owner_user_id
   and member_board.goal_title is null
  where old_category.topic_kind = 'hd_board'
    and old_category.owner_user_id is not null
    and nullif(trim(coalesce(old_category.goal_title, '')), '') is not null
    and coalesce(old_category.status, 'active') = 'active'
),
old_post_counts as (
  select
    old_hd.id as old_category_id,
    count(post.id) as post_count
  from old_hd
  left join public.board_posts post on post.category_id = old_hd.id
  group by old_hd.id
)
insert into public.board_posts (
  community_id,
  category_id,
  author_id,
  title,
  content,
  is_pinned,
  is_locked
)
select
  old_hd.community_id,
  old_hd.member_board_id,
  old_hd.owner_user_id,
  old_hd.goal_title,
  coalesce(nullif(trim(old_hd.description), ''), old_hd.goal_title),
  false,
  false
from old_hd
join old_post_counts on old_post_counts.old_category_id = old_hd.id
where old_post_counts.post_count = 0
  and not exists (
    select 1
    from public.board_posts existing
    where existing.category_id = old_hd.member_board_id
      and lower(trim(existing.title)) = lower(trim(old_hd.goal_title))
  );

-- Move existing old HD-board posts into the member HD board.
with old_hd as (
  select
    old_category.*,
    member_board.id as member_board_id
  from public.board_categories old_category
  join public.board_categories member_board
    on member_board.community_id = old_category.community_id
   and member_board.topic_kind = 'hd_board'
   and member_board.owner_user_id = old_category.owner_user_id
   and member_board.goal_title is null
  where old_category.topic_kind = 'hd_board'
    and old_category.owner_user_id is not null
    and nullif(trim(coalesce(old_category.goal_title, '')), '') is not null
    and coalesce(old_category.status, 'active') = 'active'
)
update public.board_posts post
set
  category_id = old_hd.member_board_id,
  title = case
    when lower(trim(post.title)) in ('may meeting ask', 'meeting ask', 'hd ask', 'ask', 'request', 'help request')
      then old_hd.goal_title
    else post.title
  end
from old_hd
where post.category_id = old_hd.id;

-- Keep linked wishes attached to the member board and, where possible, the moved/created thread.
with old_hd as (
  select
    old_category.*,
    member_board.id as member_board_id
  from public.board_categories old_category
  join public.board_categories member_board
    on member_board.community_id = old_category.community_id
   and member_board.topic_kind = 'hd_board'
   and member_board.owner_user_id = old_category.owner_user_id
   and member_board.goal_title is null
  where old_category.topic_kind = 'hd_board'
    and old_category.owner_user_id is not null
    and nullif(trim(coalesce(old_category.goal_title, '')), '') is not null
    and coalesce(old_category.status, 'active') = 'active'
),
target_posts as (
  select distinct on (old_hd.id)
    old_hd.id as old_category_id,
    post.id as post_id
  from old_hd
  join public.board_posts post
    on post.category_id = old_hd.member_board_id
   and lower(trim(post.title)) = lower(trim(old_hd.goal_title))
  order by old_hd.id, post.created_at
)
update public.wishes wish
set
  board_category_id = old_hd.member_board_id,
  source_board_post_id = coalesce(wish.source_board_post_id, target_posts.post_id)
from old_hd
left join target_posts on target_posts.old_category_id = old_hd.id
where wish.board_category_id = old_hd.id;

-- Archive old per-ask HD board shells now that their content lives inside member boards.
with old_hd as (
  select old_category.id
  from public.board_categories old_category
  where old_category.topic_kind = 'hd_board'
    and old_category.owner_user_id is not null
    and nullif(trim(coalesce(old_category.goal_title, '')), '') is not null
    and coalesce(old_category.status, 'active') = 'active'
)
update public.board_categories category
set
  status = 'archived',
  completed_at = coalesce(category.completed_at, now()),
  completion_note = coalesce(category.completion_note, 'Archived after this HD ask moved into the member HD board.')
from old_hd
where category.id = old_hd.id;

-- Seed the currently known HD asks as threads inside the right member boards.
with requested_threads(alias_name, profile_matches, title, content, icon, ordinal) as (
  values
    ('Charlee', array['charlee']::text[], 'Dog front-door manners practice', 'Charlee wants reminders and short front-door practice visits so the dogs can work on calmer door manners.', '🐾', 10),
    ('Charlee', array['charlee']::text[], 'Video shoot help', 'Charlee can collect video shoot needs, ideas, collaborators, and follow-up support here.', '🎬', 11),
    ('Lucas', array['lucas']::text[], 'video shoots/collaboration request', 'Lucas is looking for people to collaborate on video shoots and creative production.', '🎬', 10),
    ('Lucas', array['lucas']::text[], 'lawyer referrals for his business', 'Lucas is looking for lawyer referrals for his business, especially personal injury or workers comp, though any useful referral is welcome.', '⚖️', 11),
    ('Brit', array['brit', 'brittany']::text[], 'PMU eyebrow mapping volunteers', 'Brit is growing her PMU business and can use eyebrow mapping volunteers, feedback, referrals, photos, and business support.', '✨', 10),
    ('Brit', array['brit', 'brittany']::text[], 'Wedding help', 'Brit can collect wedding support, ideas, helpers, and follow-up needs here.', '💍', 11),
    ('Brit', array['brit', 'brittany']::text[], 'sexy photo shoot photographer recs and contact info', 'Brit is looking for recommendations and contact info for photographers who would be good for a sexy photo shoot for her upcoming marriage.', '📷', 12),
    ('Izzy', array['izzy', 'isabelle']::text[], 'Creative cockpit build-out', 'Izzy wants help with her creative cockpit build-out: ideas, supplies, measurements, photos, setup help, and follow-up support.', '🛠️', 10),
    ('Izzy', array['izzy', 'isabelle']::text[], 'weed recs', 'Izzy is looking for weed recommendations; terpene knowledge is especially welcome.', '🌿', 11),
    ('Nic', array['nic', 'nicole', 'nicholas']::text[], 'dog training accountability buddy', 'Nic wants an accountability buddy for dog training.', '🐾', 10),
    ('Nic', array['nic', 'nicole', 'nicholas']::text[], 'Body-double work sessions', 'Nic is in WA and focuses better when she can set a Google Meet or FaceTime and silently work next to someone.', '💻', 11),
    ('Fin', array['fin', 'infiniti']::text[], 'Portland recommendations and connections', 'Fin is looking for Portland recommendations and connections across dance, pole, nightlife, teaching, community, and farmers market worlds.', '🌲', 10),
    ('Ollie', array['ollie', 'oliver']::text[], 'Custom legs and mobility support', 'Ollie can collect recommendations, referrals, and follow-up support for custom legs and mobility-related help here.', '🦿', 10)
),
matched_threads as (
  select distinct on (membership.community_id, requested_threads.title)
    membership.community_id,
    profile.id as owner_user_id,
    requested_threads.title,
    requested_threads.content,
    requested_threads.ordinal,
    member_board.id as member_board_id
  from requested_threads
  join public.profiles profile
    on lower(split_part(trim(profile.name), ' ', 1)) = any(requested_threads.profile_matches)
  join public.community_memberships membership
    on membership.user_id = profile.id
  join public.board_categories member_board
    on member_board.community_id = membership.community_id
   and member_board.topic_kind = 'hd_board'
   and member_board.owner_user_id = profile.id
   and member_board.goal_title is null
  order by membership.community_id, requested_threads.title, profile.created_at
)
insert into public.board_posts (
  community_id,
  category_id,
  author_id,
  title,
  content,
  is_pinned,
  is_locked
)
select
  matched_threads.community_id,
  matched_threads.member_board_id,
  matched_threads.owner_user_id,
  matched_threads.title,
  matched_threads.content,
  false,
  false
from matched_threads
where not exists (
  select 1
  from public.board_posts existing
  where existing.category_id = matched_threads.member_board_id
    and lower(trim(existing.title)) = lower(trim(matched_threads.title))
);

-- HIVE Approved is also a container: seed common recommendation threads inside it.
with approved_boards as (
  select id, community_id
  from public.board_categories
  where name = 'HIVE Approved'
    and coalesce(status, 'active') = 'active'
),
default_authors as (
  select distinct on (membership.community_id)
    membership.community_id,
    membership.user_id
  from public.community_memberships membership
  order by membership.community_id, (membership.role = 'admin') desc, membership.created_at
),
approved_threads(title, content) as (
  values
    ('Favorite teas', 'Add favorite teas, tea shops, blends, brands, rituals, and contact info here.'),
    ('Skin care recommendations', 'Add favorite skin care products, estheticians, routines, treatments, and contact info here.'),
    ('Favorite places to donate', 'Add favorite nonprofits, mutual-aid efforts, donation spots, volunteer groups, and community projects here.'),
    ('Beauty pros: lashes, nails, brows', 'Add lash artists, nail techs, brow people, PMU artists, salons, and contact info here.'),
    ('Trusted home helpers', 'Add handy people, cleaners, organizers, movers, repair pros, and other trusted home helpers here.'),
    ('Favorite local spots', 'Add favorite dive bars, clubs, strip clubs, coffee shops, restaurants, markets, and neighborhood gems here.')
)
insert into public.board_posts (
  community_id,
  category_id,
  author_id,
  title,
  content,
  is_pinned,
  is_locked
)
select
  approved_boards.community_id,
  approved_boards.id,
  default_authors.user_id,
  approved_threads.title,
  approved_threads.content,
  false,
  false
from approved_boards
join default_authors on default_authors.community_id = approved_boards.community_id
cross join approved_threads
where not exists (
  select 1
  from public.board_posts existing
  where existing.category_id = approved_boards.id
    and lower(trim(existing.title)) = lower(trim(approved_threads.title))
);

-- Keep active board order clear: member HD boards, helpers, announcements/general, HIVE Approved, then everything else.
with ranked as (
  select
    category.id,
    row_number() over (
      partition by category.community_id
      order by
        case
          when category.topic_kind = 'hd_board' and category.goal_title is null then 0
          when category.topic_kind = 'helper_log' then 1
          when category.category_type = 'announcements' then 2
          when category.category_type = 'general' then 3
          when category.category_type = 'resources' or category.name = 'HIVE Approved' then 4
          when category.topic_kind = 'hd_board' then 5
          else 6
        end,
        case
          when category.topic_kind = 'hd_board' then coalesce(owner.name, category.name)
          else category.name
        end,
        category.display_order,
        category.created_at
    ) * 10 as display_order
  from public.board_categories category
  left join public.profiles owner on owner.id = category.owner_user_id
  where coalesce(category.status, 'active') = 'active'
)
update public.board_categories category
set display_order = ranked.display_order
from ranked
where category.id = ranked.id;

-- Normalize HD wishes so Home and member profiles use the same canonical wishes.

with charlee_member as (
  select distinct on (membership.community_id)
    membership.community_id,
    profile.id as user_id
  from public.profiles profile
  join public.community_memberships membership on membership.user_id = profile.id
  where lower(split_part(trim(profile.name), ' ', 1)) = 'charlee'
  order by membership.community_id, profile.created_at
),
charlee_targets(title, description, patterns, ordinal) as (
  values
    (
      'Aerial Video Support',
      'Charlee wants to work on a new video with her aerial partner and is looking for videographers or people who can help with filming, editing, or production support.',
      array['aerial video support', 'video shoot help']::text[],
      10
    ),
    (
      'Dog Front Door Manners Practice',
      'Charlee wants reminders and short front-door practice visits so the dogs can work on calmer door manners.',
      array['dog front door manners practice', 'dog front-door manners practice']::text[],
      20
    )
),
charlee_matches as (
  select distinct on (wish.id)
    wish.id,
    charlee_member.user_id,
    charlee_targets.title,
    charlee_targets.description
  from public.wishes wish
  join charlee_member on charlee_member.community_id = wish.community_id
  cross join charlee_targets
  left join public.board_posts source_post
    on source_post.id = wish.source_board_post_id
   and source_post.community_id = wish.community_id
  left join public.board_categories source_category
    on source_category.id = source_post.category_id
  where (
      wish.user_id = charlee_member.user_id
      or source_category.owner_user_id = charlee_member.user_id
    )
    and exists (
      select 1
      from unnest(charlee_targets.patterns) as pattern
      where trim(lower(regexp_replace(coalesce(wish.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
         or trim(lower(regexp_replace(coalesce(wish.description, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
         or trim(lower(regexp_replace(coalesce(source_post.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
         or trim(lower(regexp_replace(coalesce(source_post.content, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
    )
  order by wish.id, charlee_targets.ordinal
)
update public.wishes wish
set
  user_id = charlee_matches.user_id,
  title = charlee_matches.title,
  description = charlee_matches.description,
  raw_input = coalesce(nullif(trim(wish.raw_input), ''), charlee_matches.description),
  status = 'public',
  is_active = true,
  replaced_at = null
from charlee_matches
where wish.id = charlee_matches.id;

with charlee_member as (
  select distinct on (membership.community_id)
    membership.community_id,
    profile.id as user_id
  from public.profiles profile
  join public.community_memberships membership on membership.user_id = profile.id
  where lower(split_part(trim(profile.name), ' ', 1)) = 'charlee'
  order by membership.community_id, profile.created_at
),
charlee_targets(title, description, patterns, ordinal) as (
  values
    (
      'Aerial Video Support',
      'Charlee wants to work on a new video with her aerial partner and is looking for videographers or people who can help with filming, editing, or production support.',
      array['aerial video support', 'video shoot help']::text[],
      10
    ),
    (
      'Dog Front Door Manners Practice',
      'Charlee wants reminders and short front-door practice visits so the dogs can work on calmer door manners.',
      array['dog front door manners practice', 'dog front-door manners practice']::text[],
      20
    )
),
charlee_source_posts as (
  select distinct on (charlee_member.community_id, charlee_targets.title)
    charlee_member.community_id,
    charlee_member.user_id,
    charlee_targets.title,
    charlee_targets.description,
    charlee_targets.ordinal,
    post.id as source_board_post_id,
    post.category_id as board_category_id,
    post.created_at
  from charlee_member
  cross join charlee_targets
  left join public.board_categories category
    on category.community_id = charlee_member.community_id
   and category.topic_kind = 'hd_board'
   and category.owner_user_id = charlee_member.user_id
   and category.goal_title is null
  left join public.board_posts post
    on post.category_id = category.id
   and post.community_id = charlee_member.community_id
   and exists (
      select 1
      from unnest(charlee_targets.patterns) as pattern
      where trim(lower(regexp_replace(coalesce(post.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
         or trim(lower(regexp_replace(coalesce(post.content, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
   )
  order by charlee_member.community_id, charlee_targets.title, post.created_at nulls last
)
insert into public.wishes (
  user_id,
  community_id,
  title,
  description,
  raw_input,
  status,
  is_active,
  extracted_from,
  board_category_id,
  source_board_post_id,
  created_at
)
select
  charlee_source_posts.user_id,
  charlee_source_posts.community_id,
  charlee_source_posts.title,
  charlee_source_posts.description,
  charlee_source_posts.description,
  'public',
  true,
  'manual',
  charlee_source_posts.board_category_id,
  charlee_source_posts.source_board_post_id,
  coalesce(charlee_source_posts.created_at, now() - (charlee_source_posts.ordinal::text || ' minutes')::interval)
from charlee_source_posts
where not exists (
  select 1
  from public.wishes existing
  where existing.community_id = charlee_source_posts.community_id
    and existing.user_id = charlee_source_posts.user_id
    and existing.status in ('public', 'fulfilled')
    and (
      trim(lower(regexp_replace(coalesce(existing.title, ''), '[^a-z0-9]+', ' ', 'g'))) =
        trim(lower(regexp_replace(charlee_source_posts.title, '[^a-z0-9]+', ' ', 'g')))
      or existing.source_board_post_id = charlee_source_posts.source_board_post_id
    )
);

with charlee_member as (
  select distinct on (membership.community_id)
    membership.community_id,
    profile.id as user_id
  from public.profiles profile
  join public.community_memberships membership on membership.user_id = profile.id
  where lower(split_part(trim(profile.name), ' ', 1)) = 'charlee'
  order by membership.community_id, profile.created_at
),
support_thread_wishes as (
  select wish.id
  from public.wishes wish
  join charlee_member on charlee_member.community_id = wish.community_id
  left join public.board_posts source_post
    on source_post.id = wish.source_board_post_id
   and source_post.community_id = wish.community_id
  left join public.board_categories source_category
    on source_category.id = source_post.category_id
  where (
      wish.user_id = charlee_member.user_id
      or source_category.owner_user_id = charlee_member.user_id
    )
    and (
      trim(lower(regexp_replace(coalesce(wish.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%continue working on dog behaviors%'
      or trim(lower(regexp_replace(coalesce(source_post.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%continue working on dog behaviors%'
    )
)
update public.wishes wish
set
  status = 'replaced',
  is_active = false,
  replaced_at = coalesce(wish.replaced_at, now())
from support_thread_wishes
where wish.id = support_thread_wishes.id;

with nat_member as (
  select distinct on (membership.community_id)
    membership.community_id,
    profile.id as user_id
  from public.profiles profile
  join public.community_memberships membership on membership.user_id = profile.id
  where lower(split_part(trim(profile.name), ' ', 1)) in ('nat', 'natwalstead', 'natalie', 'nathan')
  order by membership.community_id, profile.created_at
),
nat_targets(title, description, patterns, ordinal) as (
  values
    ('Tap Shoes', 'Women''s size 8 tap shoes.', array['tap shoes', 'womens size 8 tap shoes', 'women s size 8 tap shoes']::text[], 10),
    ('HIVE App Notes', 'Notes, bug reports, and ideas for improving the HIVE app.', array['hive app notes', 'hive app note', 'app notes']::text[], 20),
    ('Multiple HIVE Version', 'Help untangle multiple HIVE app versions so everyone is looking at the right one.', array['multiple hive version', 'multiple hive versions']::text[], 30),
    ('Monthly Massages', 'Help finding, scheduling, or recommending monthly massages.', array['monthly massages', 'monthly massage']::text[], 40),
    ('Rose Bushes', 'Help with rose bushes, garden care, pruning, planting, or recommendations.', array['rose bushes', 'rose bush']::text[], 50),
    ('Learn Guitar Song', 'Help learning a guitar song.', array['learn guitar song', 'guitar song']::text[], 60),
    ('Learn ASL Song', 'Help learning an ASL song.', array['learn asl song', 'asl song']::text[], 70),
    ('Resin Art With Charlee', 'Resin art with Charlee.', array['resin art with charlee', 'resin art']::text[], 80)
),
nat_matches as (
  select distinct on (wish.id)
    wish.id,
    nat_member.user_id,
    nat_targets.title,
    nat_targets.description
  from public.wishes wish
  join nat_member on nat_member.community_id = wish.community_id
  cross join nat_targets
  where exists (
    select 1
    from unnest(nat_targets.patterns) as pattern
    where trim(lower(regexp_replace(coalesce(wish.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
       or trim(lower(regexp_replace(coalesce(wish.description, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
       or trim(lower(regexp_replace(coalesce(wish.raw_input, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
  )
  order by wish.id, nat_targets.ordinal
)
update public.wishes wish
set
  user_id = nat_matches.user_id,
  title = nat_matches.title,
  description = coalesce(nullif(trim(wish.description), ''), nat_matches.description),
  raw_input = coalesce(nullif(trim(wish.raw_input), ''), nullif(trim(wish.description), ''), nat_matches.description),
  status = case when wish.status = 'fulfilled' then 'fulfilled'::wish_status else 'public'::wish_status end,
  is_active = wish.status <> 'fulfilled',
  replaced_at = case when wish.status = 'fulfilled' then wish.replaced_at else null end
from nat_matches
where wish.id = nat_matches.id;

with nat_member as (
  select distinct on (membership.community_id)
    membership.community_id,
    profile.id as user_id
  from public.profiles profile
  join public.community_memberships membership on membership.user_id = profile.id
  where lower(split_part(trim(profile.name), ' ', 1)) in ('nat', 'natwalstead', 'natalie', 'nathan')
  order by membership.community_id, profile.created_at
),
nat_targets(title, description, patterns, ordinal) as (
  values
    ('Tap Shoes', 'Women''s size 8 tap shoes.', array['tap shoes', 'womens size 8 tap shoes', 'women s size 8 tap shoes']::text[], 10),
    ('HIVE App Notes', 'Notes, bug reports, and ideas for improving the HIVE app.', array['hive app notes', 'hive app note', 'app notes']::text[], 20),
    ('Multiple HIVE Version', 'Help untangle multiple HIVE app versions so everyone is looking at the right one.', array['multiple hive version', 'multiple hive versions']::text[], 30),
    ('Monthly Massages', 'Help finding, scheduling, or recommending monthly massages.', array['monthly massages', 'monthly massage']::text[], 40),
    ('Rose Bushes', 'Help with rose bushes, garden care, pruning, planting, or recommendations.', array['rose bushes', 'rose bush']::text[], 50),
    ('Learn Guitar Song', 'Help learning a guitar song.', array['learn guitar song', 'guitar song']::text[], 60),
    ('Learn ASL Song', 'Help learning an ASL song.', array['learn asl song', 'asl song']::text[], 70),
    ('Resin Art With Charlee', 'Resin art with Charlee.', array['resin art with charlee', 'resin art']::text[], 80)
)
insert into public.wishes (
  user_id,
  community_id,
  title,
  description,
  raw_input,
  status,
  is_active,
  extracted_from,
  created_at
)
select
  nat_member.user_id,
  nat_member.community_id,
  nat_targets.title,
  nat_targets.description,
  nat_targets.description,
  'public',
  true,
  'manual',
  now() - (nat_targets.ordinal::text || ' minutes')::interval
from nat_member
cross join nat_targets
where not exists (
  select 1
  from public.wishes existing
  where existing.community_id = nat_member.community_id
    and existing.user_id = nat_member.user_id
    and existing.status in ('public', 'fulfilled')
    and exists (
      select 1
      from unnest(nat_targets.patterns) as pattern
      where trim(lower(regexp_replace(coalesce(existing.title, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
         or trim(lower(regexp_replace(coalesce(existing.description, ''), '[^a-z0-9]+', ' ', 'g'))) like '%' || pattern || '%'
    )
);

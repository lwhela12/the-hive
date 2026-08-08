-- HIVE-Wide's Boards screen (`/hive-wide-boards`) has been live since 2026-08-03
-- and has shown nothing since: zero rows have ever had `reach = 'all_hives'`.
-- A member's first look at the room everybody is supposed to share is an empty
-- page with no way to tell whether that's broken or just quiet. One starter
-- board, anchored on OG (the only HIVE every member set has overlapped with
-- so far), with a welcome post so the room reads as founded, not broken.

insert into public.board_categories (
  community_id, name, description, category_type, icon,
  display_order, topic_kind, audience, status, is_system, reach, created_by
)
select
  c.id,
  'HIVE-Wide General Discussion',
  'The one room every HIVE shares. Say hi to people outside your own HIVE, ask a question, or just see what everyone''s up to.',
  'custom',
  '🌍',
  0,
  'discussion',
  'community',
  'active',
  false,
  'all_hives',
  p.id
from public.communities c
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'default'
  and not exists (
    select 1 from public.board_categories existing where existing.reach = 'all_hives'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content
)
select
  bc.community_id,
  bc.id,
  bc.created_by,
  'Welcome to HIVE-Wide',
  'This is the room every HIVE shares — OG, Tech, Production, and whatever comes next all land here. Drop what you''re working on, ask for help from someone outside your usual HIVE, or just say hi.'
from public.board_categories bc
where bc.name = 'HIVE-Wide General Discussion'
  and bc.reach = 'all_hives'
  and not exists (
    select 1 from public.board_posts existing where existing.category_id = bc.id
  );

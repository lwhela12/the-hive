-- One shared place for every HIVE's wins.
--
-- The two boards were both already HIVE-Wide, but their separate names made
-- "look what I did" feel like two different destinations. Keep Tech's older,
-- fuller board as the canonical one; bring over OG's real threads and retain
-- the duplicate OG welcome in its archived source board instead of deleting it.

do $$
declare
  tech_hive_id uuid;
  og_hive_id uuid;
  shared_board_id uuid;
  og_board_id uuid;
begin
  select id into tech_hive_id from public.communities where slug = 'tech' limit 1;
  select id into og_hive_id from public.communities where slug = 'default' limit 1;

  select id into shared_board_id
  from public.board_categories
  where community_id = tech_hive_id
    and name in ('HIVE Brag Board', 'Tech HIVE Brag Board', 'Brag Board')
  order by created_at
  limit 1;

  select id into og_board_id
  from public.board_categories
  where community_id = og_hive_id
    and name = 'OG HIVE Brag Board'
  order by created_at
  limit 1;

  if tech_hive_id is null or og_hive_id is null or shared_board_id is null or og_board_id is null then
    raise exception 'Expected Tech, OG, and their Brag Boards before consolidating them.';
  end if;

  update public.board_categories
  set
    name = 'HIVE Brag Board',
    description = 'Show what you made, accomplished, or are working on. One thread per thing — share it, tell us why it matters, and ask for feedback, testers, users, or cheering.',
    icon = '✨',
    reach = 'all_hives',
    status = 'active'
  where id = shared_board_id;

  -- The only duplicate is the OG board's pinned welcome. Archive it with its
  -- reply intact, so the single shared board has one clear starting point.
  update public.board_posts
  set
    archived_at = coalesce(archived_at, now()),
    is_pinned = false,
    edited_at = now()
  where category_id = og_board_id
    and is_pinned = true
    and title = 'Start here: brag on yourself';

  -- Threads retain their ids, authors, content, attachments, replies and
  -- reactions. The board's home community must travel with the category so the
  -- cross-HIVE read/write contract remains internally consistent.
  update public.board_posts
  set
    category_id = shared_board_id,
    community_id = tech_hive_id,
    visibility = 'all_hives'
  where category_id = og_board_id
    and archived_at is null;

  update public.board_replies
  set community_id = tech_hive_id
  where post_id in (
    select id from public.board_posts where category_id = shared_board_id
  );

  -- The archived duplicate remains OG history, including its original reply.
  update public.board_replies
  set community_id = og_hive_id
  where post_id in (
    select id
    from public.board_posts
    where category_id = og_board_id
  );

  update public.board_reactions
  set community_id = tech_hive_id
  where post_id in (
    select id from public.board_posts where category_id = shared_board_id
  )
     or reply_id in (
       select reply.id
       from public.board_replies reply
       join public.board_posts post on post.id = reply.post_id
       where post.category_id = shared_board_id
     );

  update public.board_categories
  set
    status = 'archived',
    description = 'Merged into HIVE Brag Board on 2026-10-09. The original welcome stays archived with this board.'
  where id = og_board_id;
end;
$$;

-- Keep the member-facing history true without adding a second announcement.
update public.app_news
set
  title = 'There is one HIVE Brag Board for all of us',
  detail = 'Share something you made, accomplished, or are working on in one place — every HIVE can see it, cheer you on, and help where you ask.'
where occurred_on = date '2026-09-06'
  and title in (
    'There is a Brag Board for what you are making',
    'Tech and OG each have a HIVE-Wide Brag Board',
    'There is one HIVE Brag Board for all of us'
  );

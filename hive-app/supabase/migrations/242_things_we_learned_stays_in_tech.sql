-- Things We Learned is Tech HIVE's library. The ideas can still be reused
-- elsewhere deliberately, but membership in another HIVE alone should not
-- open this board or its source links.
--
-- Migration 241 consolidated the duplicate Agentic Coding Principles board
-- into this one. Keep that consolidation and its thread history; only narrow
-- the resulting library back to the HIVE that owns it.

do $$
declare
  tech_hive_id uuid;
  learned_board_id uuid;
  wrong_reach_count integer;
begin
  select id into tech_hive_id
  from public.communities
  where slug = 'tech'
  limit 1;

  if tech_hive_id is null then
    raise exception 'Tech HIVE was not found.';
  end if;

  select id into learned_board_id
  from public.board_categories
  where community_id = tech_hive_id
    and name = 'Things We Learned'
  order by created_at
  limit 1;

  if learned_board_id is null then
    raise exception 'Tech HIVE Things We Learned was not found.';
  end if;

  update public.board_categories
  set
    description = 'Tech HIVE''s hard-won ideas, playbooks, and principles worth passing on. Each thread gives you the short version and links to the live source when it is safe to share.',
    reach = 'hive'
  where id = learned_board_id;

  -- Migration 232 normally carries every thread back to member visibility when
  -- a board narrows. This explicit pass also makes a rerun self-healing if the
  -- board was already narrow but a thread had drifted.
  update public.board_posts
  set visibility = 'members'
  where category_id = learned_board_id
    and visibility = 'all_hives';

  select count(*) into wrong_reach_count
  from public.board_posts
  where category_id = learned_board_id
    and visibility = 'all_hives';

  if wrong_reach_count <> 0 then
    raise exception 'Things We Learned still has % HIVE-Wide threads.', wrong_reach_count;
  end if;
end;
$$;

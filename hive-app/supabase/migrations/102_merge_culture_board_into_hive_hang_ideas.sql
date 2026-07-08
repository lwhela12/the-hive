-- Roll the "Culture & Value Creation Ideas" board into "[potential] HIVE Hang Ideas".
-- Izzy feedback: too many boards to navigate, and the hang board should explain
-- that it's a brainstorm spot (not the events list). Nothing is deleted: posts,
-- replies, reactions, and member tags all move to the hang board, and the culture
-- board is archived (status = 'archived') so its name/history stay recoverable.

do $$
declare
  community record;
  culture_board public.board_categories%rowtype;
  hang_board public.board_categories%rowtype;
  moved_posts int;
begin
  for community in select id from public.communities loop

    -- The board being folded in.
    select * into culture_board
    from public.board_categories
    where community_id = community.id
      and status <> 'archived'
      and name ilike '%culture%'
      and (name ilike '%value%' or name ilike '%creation%')
    order by created_at
    limit 1;

    -- The destination: prefer an explicit "hang idea(s)" board, fall back to any
    -- non-archived "hang" board that isn't the culture board itself.
    select * into hang_board
    from public.board_categories
    where community_id = community.id
      and status <> 'archived'
      and name ilike '%hang%'
      and (culture_board.id is null or id <> culture_board.id)
    order by (name ilike '%hang%idea%') desc, created_at
    limit 1;

    -- Clarify the hang board's purpose regardless of whether the merge runs.
    if hang_board.id is not null then
      update public.board_categories
      set description = 'A brainstorm spot for future HIVE hangs! Drop ideas for what could be fun to do together — favorites get scheduled as real events.'
      where id = hang_board.id;
    end if;

    if culture_board.id is null or hang_board.id is null then
      raise notice 'Community %: culture board (%) or hang board (%) not found — skipping merge.',
        community.id, culture_board.name, hang_board.name;
      continue;
    end if;

    -- Move every post (replies + reactions reference posts, so they follow).
    update public.board_posts
    set category_id = hang_board.id
    where category_id = culture_board.id;
    get diagnostics moved_posts = row_count;

    -- Carry over member tags without violating the unique(category_id, tagged_user_id) key.
    insert into public.board_category_member_tags
      (community_id, category_id, tagged_user_id, tagged_by, created_at)
    select community_id, hang_board.id, tagged_user_id, tagged_by, created_at
    from public.board_category_member_tags
    where category_id = culture_board.id
    on conflict (category_id, tagged_user_id) do nothing;

    delete from public.board_category_member_tags
    where category_id = culture_board.id;

    -- Repoint any wishes linked to the culture board.
    update public.wishes
    set board_category_id = hang_board.id
    where board_category_id = culture_board.id;

    -- Retire the culture board (kept, not deleted, so no one's work is erased).
    update public.board_categories
    set status = 'archived',
        completion_note = 'Merged into "' || hang_board.name || '" on ' || to_char(now(), 'YYYY-MM-DD')
    where id = culture_board.id;

    raise notice 'Community %: moved % posts from "%" into "%" and archived the source board.',
      community.id, moved_posts, culture_board.name, hang_board.name;
  end loop;
end $$;

-- A board's threads travel with the board.
--
-- Nat, 2026-09-04: she opened HIVE Approved — OG's board of trusted brands,
-- shops and local gems — and moved it to HIVE-Wide so Tech and Production could
-- read it too. Two things were wrong.
--
-- The first was the app refusing the save (fixed in `board.tsx`: a built-in
-- board can be renamed and moved, it just cannot be deleted).
--
-- The second is this one, and it is the worse of the two: `board_categories.reach`
-- and `board_posts.visibility` are separate columns, and nothing moved the
-- second when the first changed. So HIVE Approved would have arrived at
-- HIVE-Wide wearing the badge that promises "every HIVE can see and post to
-- this board" and holding, for anyone outside OG, nothing at all. Ten
-- recommendations, all `visibility = 'members'`, all invisible. An empty board
-- is not good news, and it reads as broken rather than as private.
--
-- The other direction is the leak. Bringing a shared board home hides the BOARD
-- from the other HIVEs, because that policy reads `board_categories.reach` —
-- but `board_posts`'s read policy never asks about the board. A thread left at
-- 'all_hives' stays readable by any member of any HIVE who reaches it by link.
--
-- So: one trigger, both directions, and the reach column is the single thing
-- anyone has to set.
--
-- 'public' is never touched. Publishing to the-hive.app is the owner-reviewed
-- newsletter path (`guard_post_visibility`), and moving a board around is not
-- an unpublish.

create or replace function public.board_threads_follow_board_reach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.reach is not distinct from old.reach then
    return new;
  end if;

  if new.reach = 'all_hives' then
    update public.board_posts
       set visibility = 'all_hives'
     where category_id = new.id
       and visibility = 'members';
  elsif new.reach = 'hive' then
    update public.board_posts
       set visibility = 'members'
     where category_id = new.id
       and visibility = 'all_hives';
  end if;

  return new;
end;
$$;

drop trigger if exists board_threads_follow_board_reach on public.board_categories;

create trigger board_threads_follow_board_reach
  after update of reach on public.board_categories
  for each row
  execute function public.board_threads_follow_board_reach();

comment on function public.board_threads_follow_board_reach() is
  'Moving a board between this HIVE and HIVE-Wide carries its threads with it, both ways. Public posts are left alone.';

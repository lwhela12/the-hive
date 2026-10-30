-- HD boards are done.
--
-- Nat, 2026-07-31: "No one should get an HD board ever, that was scrapped ages
-- ago." Migration 121 stopped them outside OG HIVE. This stops them everywhere.

-- The trigger goes. The functions stay on disk as history — nothing else calls
-- them, and migration 075 is easier to read with its parts still present.
drop trigger if exists auto_create_member_hd_board on public.community_memberships;

-- The two still showing. Archived rather than deleted: between them they hold a
-- handful of posts, and losing somebody's words to a tidy-up is the one mistake
-- that can't be walked back. They drop out of the boards list either way.
update public.board_categories
set status = 'archived'
where topic_kind = 'hd_board'
  and status = 'active';

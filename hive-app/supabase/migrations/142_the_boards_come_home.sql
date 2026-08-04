-- Every board comes home to OG HIVE.
--
-- Nat, 2026-08-03, and the tone matters as much as the instruction: "Gosh, i
-- cant friggin make up my mind about the friggin boards. Just put these all
-- back in OG HIVE for now & either get rid of this board section or leave it
-- like a 'coming soon' feature... No, cos then it opens up the question of 'can
-- you just tag other hives' — just move allllllll of these boards back to OG
-- hive for now, we're going to one more thing ourselves to death here."
--
-- She talked herself out of two half-measures in one breath and landed
-- correctly. Shared boards were a real answer to a real problem yesterday
-- (Announcements, HIVE Approved and the helper log existed three times over,
-- and only OG's copies had anything in them). But "a board that reaches every
-- HIVE" immediately raises "can I share ONE board with ONE other HIVE?", and
-- that is a permissions model, not an afternoon. Better to have one clear thing
-- than half of a larger one, and OG is where every one of these boards' content
-- actually lives — the nine shared boards hold 29 threads between them and all
-- 29 were written by OG members.
--
-- WHAT THIS IS NOT: a deletion, and not a loss of anything Nat has. The boards
-- keep their names, their threads, their replies and their reactions; they were
-- already hosted under OG (that was how sharing worked), so nothing moves house.
-- What changes is who can see them: back to OG HIVE only.
--
-- Reversible: set `reach` back to 'all_hives' and re-stamp the posts. The
-- policies from migration 137 and the shared-room work in 139 are untouched and
-- still correct — this is the boards changing their minds, not the idea being
-- taken out of the app.

-- 1. The boards themselves.
update public.board_categories
   set reach = 'hive'
 where reach = 'all_hives';

-- 2. Their posts, back to the HIVE that wrote them. A post must not out-reach
--    the board it sits on (the rule learned an hour ago, migration 141), so
--    leaving these at 'all_hives' would let a Tech HIVE member read OG's boards
--    through the cross-HIVE policy while every board said OG only.
--
--    'public' is deliberately left alone: seven posts are published to the
--    website on purpose, and that is a separate decision from which HIVEs can
--    see them in the app.
update public.board_posts p
   set visibility = 'members'
  from public.board_categories bc
 where bc.id = p.category_id
   and p.visibility = 'all_hives';

-- 3. The one board whose name is now a lie. "HIVE-Wide General Discussion" was
--    created yesterday as the shared room's board and never used — zero threads,
--    zero replies — and OG already has its own General Discussion. Renaming it
--    would leave OG with two, so it goes. Nothing is lost with it because
--    nothing was ever in it, and a board is one tap to recreate.
delete from public.board_categories
 where name = 'HIVE-Wide General Discussion'
   and not exists (
     select 1 from public.board_posts p
      where p.category_id = board_categories.id
   );

-- Announcements stops being the attic, and becomes the app's channel.
--
-- Nat, 2026-08-03, working it out mid-sentence: "ahhhhhhhhh i got it!!! I think
-- these 'announcements' can you please migrate them all into the OG HIVE
-- general discussion? & we can use the announcement boards for tech updates?"
--
-- She's right, and the reason it works is worth writing down: "Announcements"
-- had become a description of IMPORTANCE rather than of SUBJECT — tickets for
-- TASTE, Tater's novel, a friend's move, a PSA about gel nail polish, and a
-- webapp release, all filed together because each mattered at the time. A board
-- named for how much something matters can only ever fill up, because
-- everything matters to somebody. A board named for a subject stays useful.
--
-- So the fifteen live there no longer: they are OG HIVE's own history, and they
-- go where OG HIVE talks. What's left is a channel with one job — what changed
-- in the app — which is a thing people can choose to care about, and which is
-- genuinely everybody's business across all three HIVEs.
--
-- REVERSIBLE. Nothing is deleted and no ids change: this moves `category_id`
-- and `visibility` on fifteen rows. Replies and reactions hang off post_id, not
-- category_id, so every comment and every heart travels with its post
-- untouched. Putting it back is the same UPDATE with the ids swapped.

-- The fifteen, and where they're going. Matched by id rather than by name so a
-- later rename can't make this file quietly move the wrong board's posts.
update public.board_posts
   set category_id = '1d37e685-6f3e-4d8b-82ba-99648422cbcd',  -- OG General Discussion
       -- Back to OG-only, because that is what the board they're joining is.
       -- These were re-stamped 'members' → 'all_hives' yesterday when
       -- Announcements became a shared board (Nat approved that, seeing the
       -- examples). That stamp was right for a shared board and is wrong the
       -- moment they land in a HIVE's own room: leaving it would let a Tech
       -- HIVE member read OG's private history through the all-HIVEs policy
       -- while the board itself said OG only. The two have to agree.
       visibility = 'members'
 where category_id = '0d73db1e-f723-4258-8b99-ff085687e8b3';  -- Announcements

-- The board's new job, in the description members actually read.
update public.board_categories
   set description = 'What changed in the app — new features, fixes, and what is coming next. Every HIVE sees this one.'
 where id = '0d73db1e-f723-4258-8b99-ff085687e8b3';

comment on table public.board_posts is
  'Threads on a board. A post''s visibility must not out-reach the board it sits on — a members-only board holding all_hives posts leaks through the cross-HIVE policy (learned 2026-08-03, moving Announcements'' history into OG General Discussion).';

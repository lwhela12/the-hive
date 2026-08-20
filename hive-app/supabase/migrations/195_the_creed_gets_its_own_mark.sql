-- =============================================================================
-- 195_the_creed_gets_its_own_mark.sql
--
-- Two boards were wearing the same face.
--
-- Nat, 2026-08-20: *"HIVE help and HIVE creed have the same emoji and I would
-- like those to be different, please."* They did — both 🤝. In a board list
-- that reads icon-first, two identical marks side by side make one board look
-- like a duplicate of the other, and the one people skip is whichever they
-- decide is the copy.
--
-- The handshake stays with HIVE Helpers, where it means the thing it looks
-- like: somebody putting a hand out. The Creed gets 📜 — the words everybody
-- agrees to on the way in, which is what a scroll has always been.
-- =============================================================================

update public.board_categories
set icon = '📜'
where name = 'The HIVE Creed'
  and icon = '🤝';

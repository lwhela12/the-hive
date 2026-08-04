-- Board icons are emoji, and six of them were not.
--
-- Found while checking whether a `hive:<name>` → emoji migration was needed for
-- the custom-icon sweep (Nat 2026-08-04: "we swapped back to regular emojis
-- everywhere"). It was not — zero rows use the `hive:` form, so that code can be
-- deleted outright. But the same query turned up six boards whose icon is a raw
-- Unicode CODE POINT stored as text: `1F4AC` rather than 💬.
--
-- Nothing decodes those. `EMOJI_MAP[item.icon] || item.icon` falls through to
-- the raw string, so a board card renders the literal characters "1F4AC" where
-- its icon should be. Two of them are the Tech and Production General
-- Discussions — the first board a member of either HIVE ever opens.
--
-- Converted, not guessed: each is the real code point for the emoji named.
update public.board_categories set icon = '💬' where icon = '1F4AC';  -- speech balloon
update public.board_categories set icon = '🎯' where icon = '1F3AF';  -- direct hit
update public.board_categories set icon = '🧠' where icon = '1F9E0';  -- brain
update public.board_categories set icon = '👑' where icon = '1F451';  -- crown
update public.board_categories set icon = '👋' where icon = '1F44B';  -- waving hand

-- Anything else of that shape, now or later, is safer blank than wrong: a board
-- with no icon looks deliberate, a board reading "1F4AC" looks broken.
update public.board_categories
   set icon = null
 where icon ~ '^[0-9A-Fa-f]{4,6}$';

-- Tech HIVE was wearing Production's costume.
--
-- Nat, 2026-08-27, looking at the Tech HIVE check-in: *"Tech HIVE has the wrong
-- emoji — it has the director's cut board, like for movies. Tech HIVE should
-- have the little robot, it's cute, that's what I use on my Google Calendar.
-- Tech HIVE is the wrong colour too — I just opened the survey and it's purple.
-- Tech HIVE is blue, should be dark blue, we have branded content."*
--
-- Two halves to the fix, and only one of them is data.
--
-- **The colour is data**, and it already reads right in the database: Tech is
-- `#2f4a63`, Production is `#6b4a8f`, OG is null and therefore honey gold. What
-- was missing is the RECORD. Production's purple was written down by migration
-- 122; Tech's blue was set by hand and appears in no migration at all, so a
-- rebuild from this folder would have handed Tech the default gold and nobody
-- would have known why. This writes it down. Idempotent, and a no-op against
-- the live rows as they stand today.
--
-- **The emoji is not data**, deliberately. There is no icon column on
-- `communities`, and a HIVE's emoji is the kind of thing that has to be right
-- in an email subject line rendered by an edge function with no row to read —
-- so it lives beside the accent in `hive-app/lib/hiveBrand.ts` (`HIVE_MARKS`),
-- with a deliberate second copy for the Deno side in
-- `supabase/functions/_shared/hiveMark.ts`. Bee for OG, robot for Tech,
-- clapperboard for Production. A fourth HIVE is a fourth entry in that table,
-- never a fourth `if`. If the emoji ever needs to be Nat-editable without a
-- deploy, THAT is when it earns a column.

update public.communities
   set accent_color = '#2f4a63'          -- Tech HIVE — dark blue
 where slug = 'tech'
   and accent_color is distinct from '#2f4a63';

update public.communities
   set accent_color = '#6b4a8f'          -- Production HIVE — purple, the show HIVE
 where slug = 'show'
   and accent_color is distinct from '#6b4a8f';

-- OG HIVE keeps `accent_color` null on purpose: null means honey gold, the HIVE
-- default (migration 120), and OG is the HIVE the default was cut from.

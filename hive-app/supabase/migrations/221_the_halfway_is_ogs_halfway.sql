-- Production's halfway check-in becomes OG's halfway check-in.
--
-- Migration 214, one day earlier, rebuilt this row from OG's **pre-meeting**
-- check-in (Monthly Check-in: POP + Energy) in the belief that it was OG's
-- halfway one. OG has two, and they are not alike. Nat opened the result on
-- 2026-08-27 and needed one glance: *"this looks like the three days before
-- the meeting, and there's no HIVE Help. This is all bad."*
--
-- Her instruction: *"The OG HIVE halfway check-in is perfect. Can you just do
-- that for Production HIVE? Why can't you just copy the same thing? Why is it
-- different?"*
--
-- So the halfway is not a survey any more. **The door is OG's wizard** —
-- Newsletter -> To-dos -> HIVE Help, three steps, about two minutes
-- (`MIDPOINT_STEPS` in monthly-tuneup.tsx, reached because
-- `HALFWAY_BY_SLUG.show.flow` is `tuneup` rather than `survey`). What is left
-- of this row is the FILING CABINET behind that wizard: the one answer the
-- three steps have nowhere else to put, which is the newsletter ask that
-- Admin's Newsletter box reads under the member's name and their HIVE.
--
-- The other two steps already file themselves — to-dos are ticked on the
-- member's own list, HIVE Help posts to the Helpers board — which is why one
-- question is the whole of it, and why every question here still names where
-- its answer goes (Nat, 2026-08-27: *"If you're going to make someone answer a
-- question, you better damn well know what you're going to do with the
-- answer."*).
--
-- The arrival, energy and POP questions are not lost. They are what a
-- PRE-MEETING check-in is for, and Production's is designed on its own, closer
-- to its meeting (Nat, 2026-08-28: *"Pro HIVE's pre-meeting survey will be
-- unique, so we'll talk about that closer to the meeting"*).
--
-- The TITLE changes for the first time to something the emails already say:
-- `END_OF_MONTH_CHECK_IN_PATTERN` in `_shared/checkInPatterns.ts` has matched
-- "Halfway check-in" since 2026-08-15, so the cron, Home and Meetings all
-- still recognise the row. The DESCRIPTION deliberately avoids the words
-- "monthly check-in", which would route it into OG's PRE-MEETING wizard.
--
-- The words live in `lib/checkIns.ts` (END_OF_MONTH_BY_SLUG). This file is the
-- repo's record of the row already updated through the REST API, and it only
-- ever touches the one survey it names.

update public.surveys
   set title = 'Halfway check-in',
       description = 'Halfway through the month — the newsletter goes out on the 1st. Two minutes: anything for the letter, tick off what you have done, and say if you want a hand.',
       questions = '[
  {
    "id": "q_newsletter",
    "text": "Anything for the newsletter? A shout-out, a plug, an event to come to, a reminder, or a compliment for someone — name names, they get read out. The newsletter goes out on the 1st.",
    "type": "long",
    "required": false
  }
]'::jsonb
 where id = 'f7ee3530-0adb-4a74-9787-536d20223dbd';

-- The preview built from the wrong check-in is still parked in Admin waiting
-- on Nat, and approving it would send that copy to five people. It is retired
-- rather than deleted, so the record of what was nearly sent survives.
update public.notifications
   set metadata = metadata
         || jsonb_build_object('check_in_approval', 'superseded')
         || jsonb_build_object('check_in_superseded_on', '2026-08-28')
 where id = '409249ef-7e63-412f-b237-d0d7103f269d'
   and metadata->>'check_in_approval' = 'pending';

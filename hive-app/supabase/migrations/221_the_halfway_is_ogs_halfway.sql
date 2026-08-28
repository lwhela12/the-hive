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

-- One board Production did not have, and the halfway needs.
--
-- The newsletter step's "Compliment someone" pill posts to Compliment Corner,
-- and Production had none, so that pill answered *"Could not find Compliment
-- Corner. You can post it from the Boards tab instead"* — pointing a member at
-- a board that does not exist.
--
-- HIVE Helpers is deliberately NOT here. A first pass created one, reasoning
-- that OG's halfway has a HIVE Help step and Production's is a copy of it. Nat,
-- 2026-08-28: *"Pro HIVE 1/2 way check in is ALMOST beat for beat like OG HIVE,
-- except Pro HIVE does NOT have a HIVE Help."* It is OG's ritual — the
-- 15-minute favour swap, with its own board and its own monthly focus thread —
-- and Production has never run it. The board was removed the same morning, and
-- the step went with it (`SHOW_MIDPOINT_STEPS` in monthly-tuneup.tsx,
-- `_shared/halfwaySteps.ts` for the letter that invites people to it).
--
-- Mirrors OG's row; `topic_kind` is what the app matches on, so renaming the
-- board later cannot break the check-in.
insert into public.board_categories
  (community_id, name, description, category_type, icon, display_order,
   is_system, requires_admin, requires_approval, audience, topic_kind,
   goal_title, status, reach)
select
  '8a2b94a7-b7e2-4c79-bf32-e6467c46f4fb', v.name, v.description, 'custom',
  v.icon, v.display_order, false, false, false, 'community', v.topic_kind,
  v.goal_title, 'active', 'hive'
from (values
  ('Compliment Corner',
   'Say something nice, any time. @ someone and they get a little love note the moment you post. Compliments also get read out at the meeting.',
   '💐', 126, 'compliments', null)
) as v(name, description, icon, display_order, topic_kind, goal_title)
where not exists (
  select 1 from public.board_categories existing
   where existing.community_id = '8a2b94a7-b7e2-4c79-bf32-e6467c46f4fb'
     and existing.topic_kind = v.topic_kind
);

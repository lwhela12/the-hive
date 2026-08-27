-- Production's end-of-month check-in gets OG's shape.
--
-- Nat, 2026-08-27, on the three blank prose boxes that stood here — "What
-- moved this month", "What is stuck", "What has to happen before the next
-- meeting": **"coarse shit and unusable."** More work than OG's and less use.
-- Her rule the same morning is why every question below names where its answer
-- goes: *"If you're going to make someone answer a question, you better damn
-- well know what you're going to do with the answer. Having people fill out
-- surveys and then not having their answers go anywhere is just having them do
-- busy work, and it's bad."*
--
-- So it mirrors OG's `Monthly Check-in: POP + Energy` — arrival, energy, the
-- POP, the HIVE Help recap, the newsletter ask — in Production's own subject
-- matter. Every id is already read by something:
--
--   q_feeling_today / q_energy_level / q_energy_mode  -> the Arrival Board
--   q_show_progress / q_show_obstacles                -> Production's meeting
--                                                        deck, by name
--   q_pop_priorities                                  -> Admin's POP export
--   q_hive_help_recap                                 -> the 1-5 focus score
--   q_newsletter                                      -> Nat's Newsletter box
--                                                        in Admin, under the
--                                                        member's name and HIVE
--
-- The progress box arrives pre-filled with what this member already ticked off
-- since the last meeting, and their open to-dos ride above the questions on the
-- carry-forward roster, so nobody is asked to retype what the app already knows.
--
-- The words live in `lib/checkIns.ts` (END_OF_MONTH_BY_SLUG). This file is the
-- repo's record of the row that was already updated through the REST API, and
-- it only ever touches the one survey it names.
--
-- The TITLE is deliberately unchanged: `END_OF_MONTH_CHECK_IN_PATTERN` in
-- `_shared/checkInPatterns.ts` is how the cron, Home and the Meetings screen
-- all recognise this check-in.

update public.surveys
   set description = 'A quick POP + Energy check-in so the HIVE can celebrate what moved on the show, spot what is stuck, choose what is next, and keep the right things on the roster. Blanks are completely fine.',
       questions = '[
  {
    "id": "q_feeling_today",
    "text": "Arrival: how are you feeling right now?",
    "type": "choice",
    "options": [
      "😊 Great — bring it on!",
      "😌 Good & steady",
      "🫠 Tired, but here",
      "🤒 Under the weather — love me from a distance",
      "💛 Sad — extra hugs please",
      "🖤 Sad — please don''t ask about it",
      "🌀 All over the place"
    ],
    "required": false
  },
  {
    "id": "q_energy_level",
    "text": "Energy: what is your energy level right now?",
    "type": "scale",
    "required": false
  },
  {
    "id": "q_energy_mode",
    "text": "Energy: what would feel best from HIVE this month?",
    "type": "choice",
    "options": [
      "I could use support",
      "I could use space",
      "I am steady",
      "I have energy to offer help"
    ],
    "required": false
  },
  {
    "id": "q_show_progress",
    "text": "Progress: what moved on the show this month — venues seen, calls made, numbers learned? Anything you ticked off is already here; add whatever else you did.",
    "type": "long",
    "required": false
  },
  {
    "id": "q_show_obstacles",
    "text": "Obstacles: what is stuck, or waiting on somebody? How can HIVE help?",
    "type": "long",
    "required": false
  },
  {
    "id": "q_pop_priorities",
    "text": "Priorities: what has to happen before the next meeting?",
    "type": "long",
    "required": false
  },
  {
    "id": "q_hive_help_recap",
    "text": "How''d this month''s HIVE Help go?",
    "type": "focus",
    "required": false
  },
  {
    "id": "q_newsletter",
    "text": "Anything for the newsletter? A shout-out, a plug, an event to come to, a reminder, or a compliment for someone — name names, they get read out. The newsletter goes out on the 1st.",
    "type": "long",
    "required": false
  }
]'::jsonb
 where id = 'f7ee3530-0adb-4a74-9787-536d20223dbd';

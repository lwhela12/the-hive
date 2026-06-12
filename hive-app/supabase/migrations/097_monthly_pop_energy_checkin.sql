-- Reshape the standing Monthly Check-in around POP + Energy.
-- Keep the same survey record so existing response history and monthly periods stay attached.

update public.surveys
set
  title = 'Monthly Check-in: POP + Energy',
  description = 'A quick POP + Energy check-in so HIVE can celebrate progress, spot obstacles, choose priorities, and keep the right things on the roster.',
  questions = '[
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
      "id": "q_pop_progress",
      "text": "Progress: what moved forward since last HIVE? Give yourself a little pat on the back.",
      "type": "long",
      "required": false
    },
    {
      "id": "q_pop_obstacles",
      "text": "Obstacles: where are you stuck, and how could HIVE help?",
      "type": "long",
      "required": false
    },
    {
      "id": "q_pop_priorities",
      "text": "Priorities: what are you focusing on before the next HIVE?",
      "type": "long",
      "required": false
    },
    {
      "id": "q_carry_forward",
      "text": "Carry-forward: anything from your HD boards, wishes, to-do list, or previous notes that should stay active, get attention, be marked complete, or be archived?",
      "type": "long",
      "required": false
    },
    {
      "id": "q_meeting_topic",
      "text": "Anything you want HIVE to mull over at the meeting, even if you might miss it?",
      "type": "long",
      "required": false
    }
  ]'::jsonb
where title = 'Pre-Meeting Elevator Pitch'
  or title ~* '^monthly[[:space:]]+check-?in';

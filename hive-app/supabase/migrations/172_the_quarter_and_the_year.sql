-- 172: the quarter and the year become real check-ins (2026-08-12).
--
-- Nat's Trello, Phase 2: BUILD the end-of-quarter check-in for OG, Tech and
-- Production HIVE (three days before the quarter ends), and the end-of-year
-- check-in for each HIVE, same shape. Both were listed in italics as coming
-- soon; this is the moment they exist, so the italics flip.
--
-- No schema change. Each occurrence of a season check-in is an ordinary row
-- in `surveys`, recognised by its title the same way the monthly check-in
-- has always been ("Quarterly Check-in · Q3 2026", "End-of-Year Check-in ·
-- 2026"). Members answer through the existing survey card on Home, and the
-- `check-in-reminder` cron nudges three days before the end date and gives a
-- last call on the day — only ever to a HIVE that actually holds the active
-- survey, which is the property that keeps the cron safe.
--
-- This seeds THE FIRST occurrence of each — Q3 2026 and the 2026 year-end —
-- for all three HIVEs, so the rhythm starts without waiting on a button.
-- Members see nothing until three days before the quarter/year ends (Sep 27
-- and Dec 28 — the app computes those from the due date, nothing here is a
-- nudge date), which leaves weeks for Nat to reword the questions in the
-- running app. Every occurrence after these is launched from the Admin
-- screen's Check-ins tab, where the wording comes from the per-HIVE decks in
-- lib/checkIns.ts — that file is the living source of these words; the copies
-- below are a snapshot taken at seed time.
--
-- December deliberately has no Q4 quarterly: the quarter-end and the
-- year-end are the same three days, and the year check-in takes that slot.
-- The quarterly runs March, June and September.
--
-- due_date follows the house convention (see check-in-reminder/index.ts):
-- midnight UTC of the day AFTER the real Pacific day, which renders as 5pm
-- Pacific on the quarter/year's true last day.

insert into public.surveys (community_id, title, description, questions, due_date, is_active)
select c.id, v.title, v.description, v.questions::jsonb, v.due_date::timestamptz, true
from public.communities c
join (
  values
    -- ---------------------------------------------------------- OG HIVE (slug `default`)
    (
      'default',
      'Quarterly Check-in · Q3 2026',
      'Three months went by — take five quiet minutes to look back before the next ones start. Short answers are perfect.',
      '[
        {"id":"q_quarter_story","text":"How did the last three months go? Tell it however it comes — highlights, lowlights, plot twists.","type":"long","required":false},
        {"id":"q_quarter_proud","text":"What are you proudest of from this quarter?","type":"long","required":false},
        {"id":"q_quarter_heavy","text":"What took more out of you than it should have?","type":"long","required":false},
        {"id":"q_quarter_next","text":"What do you want the next three months to hold?","type":"long","required":false},
        {"id":"q_quarter_hive","text":"Anything HIVE can do to make next quarter easier — or more fun?","type":"long","required":false},
        {"id":"q_quarter_word","text":"One word for the quarter.","type":"short","required":false}
      ]',
      '2026-10-01T00:00:00Z'
    ),
    (
      'default',
      'End-of-Year Check-in · 2026',
      'The year is wrapping up. Look back with us, celebrate a little, and point at what comes next. Short answers are perfect.',
      '[
        {"id":"q_year_headline","text":"Your headline for the year — the one-liner you''d tell an old friend.","type":"short","required":false},
        {"id":"q_year_proud","text":"What moment from this year are you proudest of?","type":"long","required":false},
        {"id":"q_year_thanks","text":"Who showed up for you this year? Name names — they might get a shout-out.","type":"long","required":false},
        {"id":"q_year_release","text":"What are you happily leaving behind with this year?","type":"long","required":false},
        {"id":"q_year_wish_me","text":"One wish for yourself next year.","type":"long","required":false},
        {"id":"q_year_wish_hive","text":"And one wish for the HIVE.","type":"long","required":false},
        {"id":"q_year_cup","text":"How full is your cup heading into the new year?","type":"scale","required":false}
      ]',
      '2027-01-01T00:00:00Z'
    ),
    -- ---------------------------------------------------------- Tech HIVE
    (
      'tech',
      'Quarterly Check-in · Q3 2026',
      'Three months went by — take five quiet minutes to look back before the next ones start. Short answers are perfect.',
      '[
        {"id":"q_quarter_shipped","text":"What did you build, ship, or learn this quarter?","type":"long","required":false},
        {"id":"q_quarter_proud","text":"What are you proudest of — even if nobody else saw it?","type":"long","required":false},
        {"id":"q_quarter_stuck","text":"Where did you stay stuck the longest, and what would have helped?","type":"long","required":false},
        {"id":"q_quarter_next","text":"What do you want to be true by the end of next quarter?","type":"long","required":false},
        {"id":"q_quarter_hive","text":"What could this HIVE do for you next quarter — an intro, a second pair of eyes, a nudge?","type":"long","required":false},
        {"id":"q_quarter_word","text":"One word for the quarter.","type":"short","required":false}
      ]',
      '2026-10-01T00:00:00Z'
    ),
    (
      'tech',
      'End-of-Year Check-in · 2026',
      'The year is wrapping up. Look back with us, celebrate a little, and point at what comes next. Short answers are perfect.',
      '[
        {"id":"q_year_headline","text":"Your year, in one line.","type":"short","required":false},
        {"id":"q_year_proud","text":"What did you make this year that you''re proudest of?","type":"long","required":false},
        {"id":"q_year_growth","text":"What can you do now that you couldn''t in January?","type":"long","required":false},
        {"id":"q_year_thanks","text":"Who helped you get there? Name names.","type":"long","required":false},
        {"id":"q_year_next","text":"What do you want to take a real swing at next year?","type":"long","required":false},
        {"id":"q_year_wish_hive","text":"One wish for this HIVE next year.","type":"long","required":false},
        {"id":"q_year_cup","text":"How charged is your battery heading into the new year?","type":"scale","required":false}
      ]',
      '2027-01-01T00:00:00Z'
    ),
    -- ---------------------------------------------------------- Production HIVE (slug `show`)
    (
      'show',
      'Quarterly Check-in · Q3 2026',
      'Three months went by — take five quiet minutes to look back before the next ones start. Short answers are perfect.',
      '[
        {"id":"q_quarter_stage","text":"What did you perform, book, or bring to life this quarter?","type":"long","required":false},
        {"id":"q_quarter_proud","text":"What moment are you proudest of — on stage or behind the scenes?","type":"long","required":false},
        {"id":"q_quarter_wings","text":"What''s been waiting in the wings that didn''t get its moment yet?","type":"long","required":false},
        {"id":"q_quarter_next","text":"What are you building toward for the next three months?","type":"long","required":false},
        {"id":"q_quarter_hive","text":"How can this HIVE help you get there?","type":"long","required":false},
        {"id":"q_quarter_word","text":"One word for the quarter.","type":"short","required":false}
      ]',
      '2026-10-01T00:00:00Z'
    ),
    (
      'show',
      'End-of-Year Check-in · 2026',
      'The year is wrapping up. Look back with us, celebrate a little, and point at what comes next. Short answers are perfect.',
      '[
        {"id":"q_year_headline","text":"Your year, in one line — the marquee version.","type":"short","required":false},
        {"id":"q_year_proud","text":"What was your favorite moment on stage this year? And your favorite one off it?","type":"long","required":false},
        {"id":"q_year_growth","text":"What can you do now that you couldn''t at the start of the year?","type":"long","required":false},
        {"id":"q_year_thanks","text":"Who deserves a standing ovation for showing up for you this year?","type":"long","required":false},
        {"id":"q_year_next","text":"What''s the dream booking, act, or project for next year?","type":"long","required":false},
        {"id":"q_year_wish_hive","text":"One wish for this HIVE next year.","type":"long","required":false},
        {"id":"q_year_cup","text":"How full is your tank heading into the new year?","type":"scale","required":false}
      ]',
      '2027-01-01T00:00:00Z'
    )
) as v(slug, title, description, questions, due_date)
  on v.slug = c.slug
-- Idempotent: re-running this (or having launched the same occurrence from
-- Admin first) inserts nothing rather than a duplicate card on Home.
where not exists (
  select 1 from public.surveys s
  where s.community_id = c.id
    and s.title = v.title
);

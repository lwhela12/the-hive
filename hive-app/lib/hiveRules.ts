/**
 * The rules, in plain English, where Nat can read them.
 *
 * A port of the standalone page's `lib/rules.ts` (2026-09-02), because she
 * asked for the whole of The Things We Know inside the app: *"yes, I did like
 * the Things We Know and the grid and the rules all folded into the HIVE as
 * well."*
 *
 * Written the way she reads, not the way the code reads. The first version of
 * this list described mechanisms — `HALFWAY_BY_SLUG`, `isInHalfwayWindow` — and
 * she said of three of them, *"I don't know what that means."* Each rule now
 * says what HAPPENS; `source` is for whoever has to go and change it.
 */
export type HiveRule = { text: string; source: string };
export type RuleGroup = { heading: string; rules: HiveRule[] };

export const HIVE_RULES: RuleGroup[] = [
  {
    heading: 'What sends, and when',
    rules: [
      {
        text: 'Approve generic template words once in The emails we send. Wording changes need approval again; HIVE seals and colours do not. Freshly written emails, including The Buzz, still need review before each send.',
        source: 'email_template_approvals + email-preview',
      },
      {
        text: 'One thing in the HIVE sends on a clock, and it runs at 6am your time. Nothing else mails a group by itself.',
        source: 'cron — check-in-reminder-daily',
      },
      {
        text: 'Before we meet goes out the DAY BEFORE that meeting, and only to the people in it who have not answered yet. Meeting on Tuesday means the email goes Monday.',
        source: 'open-check-in — meets tomorrow',
      },
      {
        text: 'It never names another HIVE or another HIVE\u2019s meeting day. One letter per meeting, so everyone reading it is already inside the HIVE it is about.',
        source: 'settled 2026-09-04',
      },
      {
        text: 'Answer for one HIVE and that HIVE goes quiet. Fill in every section on Monday and you hear nothing until the day before your next meeting; fill in one and you get asked again before the next.',
        source: 'answered is counted per HIVE',
      },
      {
        text: 'That email takes its weekday, time, place and note straight off the meeting. If the time looks wrong, fix the meeting and the email fixes itself.',
        source: 'meetingArtifact.ts',
      },
      {
        text: 'The Buzz goes out on the 1st, to everybody, one letter covering all three HIVEs in general terms. Each issue recaps the month before — September’s covers August.',
        source: 'newsletter board + send log',
      },
      {
        text: 'Write it on the last day of the month, so the End of the month answers are already in it.',
        source: 'End of the month lands on the 28th',
      },
    ],
  },
  {
    heading: 'The two check-ins',
    rules: [
      {
        text: 'Two have names, and both stay open in Meetings whenever you want them. Before we meet nudges you the day before your meeting. End of the month nudges you three days before the month ends.',
        source: 'named 2026-09-02',
      },
      {
        text: 'There are TWO survey rows in the whole app, and neither belongs to a HIVE. It does not matter if you are in one HIVE or all three \u2014 you get one of each.',
        source: 'surveys where is_active, 2026-09-04',
      },
      {
        text: 'Everything else is a SECTION inside one of those two. The questions about you at the top, then one short section per HIVE you are in.',
        source: 'a check-in is sections',
      },
      {
        text: 'The Quarterly and the End-of-Year are sections too. They appear inside End of the month for the three days they are open and fall away after \u2014 nothing to launch, nothing to retire.',
        source: 'openSeasonSections',
      },
      {
        text: 'A HIVE\u2019s first-night questions fall away by themselves. The check-in asks whether that HIVE has met yet, and swaps to its recurring deck the morning after.',
        source: 'no deploy, no edit',
      },
      {
        text: 'Read any date early: /endofmonth?on=2026-09-29 shows the check-in as it will be that day.',
        source: 'the ?on= parameter',
      },
      {
        text: 'Both check-ins sit on the Meetings page in every HIVE, every day. Answered on Monday and feel different by Thursday? Go back in and change it.',
        source: 'always open, always there',
      },
      {
        text: 'Missing a window closes nothing. The link and the Meetings pills always open the check-in — the window only decides when Home, email or a notification nudges somebody.',
        source: 'Meetings is the always-open door; timing gates nudges only',
      },
      {
        text: 'The answers live in one shared check-in, but the screen keeps the HIVE where you opened it. Enter from Tech and its header, colours and return path stay Tech.',
        source: 'shared data does not erase place, 2026-09-05',
      },
      {
        text: 'People here answer on meeting night, not in the days before it. In June, 5 of 7 answered within fifteen minutes of each other, during the meeting. Quiet beforehand is normal.',
        source: 'verified 2026-09-01',
      },
      {
        text: 'Answer twice in a month and the second answer replaces the first. The screen says so before anybody types.',
        source: 'checkInAlreadyDone',
      },
    ],
  },
  {
    heading: 'Who can see what',
    rules: [
      {
        text: 'A member gets two choices and only two: just this HIVE, or HIVE-Wide. It starts on the smaller one.',
        source: 'profile_scope, default_share_scope',
      },
      {
        text: 'Production is the exception. Nothing in Production is offered HIVE-Wide at all — it stays inside Production.',
        source: "max_share_scope = 'hive', 2 Sept",
      },
      {
        text: 'No member can make anything public, in any HIVE. Public means the newsletter and the invitation on the-hive.app, and you write both.',
        source: 'public is editorial',
      },
      {
        text: 'The public side never carries a name, a members list, a wish, or anybody’s check-in. Only what you put in the letter.',
        source: 'anonymous replay verified 20 Aug',
      },
      {
        text: 'Nothing is ever copied between HIVEs. A thing lives where it was written and has a reach; reach only decides who it shows up for.',
        source: 'HIVE-Wide design, 3 Aug',
      },
    ],
  },
  {
    heading: 'When each HIVE meets',
    rules: [
      {
        text: 'The meeting target is the second week: Tech Tuesday, OG Wednesday, Production Thursday, all 6–8pm Pacific. This is a planning target, not a calendar booking; agreed exceptions win.',
        source: 'set 2026-09-03; the shape, not a booking',
      },
      {
        text: 'That is a loose structure, not a rule. Whatever the room decides in the meeting overrides it, and the room is right. September\u2019s OG moved out a week because Brittany\u2019s wedding is the 14th and she was rightly somewhere else.',
        source: 'Nat, 2026-09-03: \u201cthe humans override the loose structure\u201d',
      },
      {
        text: 'Nothing repeats. Each HIVE has exactly ONE meeting on the books at a time, and the next one gets scheduled at the top of the meeting before it, in the Meeting Helper.',
        source: 'Nat, 2026-09-03',
      },
      {
        text: 'That is why nothing repeats: a standing placeholder plus a date the room actually picked is two meetings on everybody\u2019s calendar, and nothing ever takes the first one away. Scheduling always makes a NEW calendar event; it cannot move one it did not make.',
        source: 'schedule-meeting knows nothing about recurrence',
      },
      {
        text: 'Scheduling it saves it in the Meeting Helper, in the app, and on Upcoming Events at once \u2014 and everyone gets Add to Calendar for whichever calendar they keep.',
        source: 'one place, many ways in',
      },
      {
        text: 'Second week means a shared Tuesday–Thursday target, not three independently calculated second weekdays. Confirm actual dates with each HIVE; changing this guidance does not move any meeting.',
        source: 'the \u201cish\u201d in second-week-ish',
      },
      {
        text: 'The HIVE app schedules as Nat, onto that HIVE\u2019s own Google Calendar, and every member of a HIVE is on that calendar. So a new meeting turns up for people without anybody being invited by hand.',
        source: 'communities.google_calendar_id, 2026-09-03',
      },
    ],
  },
  {
    heading: 'If this, then that',
    rules: [
      {
        text: 'If End of the month and the newsletter land in the same week — they always do, by design — the check-in is what fills the letter. Ask first, write second.',
        source: "its first step is Newsletter",
      },
      {
        text: 'If a meeting moves, everything about that meeting moves with it — the email, the last nudge, the Home card, the due date. No day of the week is hardcoded anywhere.',
        source: 'everything reads the meeting row',
      },
      {
        text: 'End of the month is the one that does not move. It counts to the end of the calendar month, so it lands on the same days whatever the meetings do.',
        source: 'getWindowOpenDate, not the meeting row',
      },
      {
        text: 'If a HIVE has no meeting on the books, it gets no meeting nudge. It still gets End of the month — that one is on the calendar, not on the meeting.',
        source: 'no meeting → no meeting window',
      },
      {
        text: 'If a question gets reworded under a new id, the slide that reads it goes blank — silently. The deck and the survey share ids.',
        source: 'shared question ids',
      },
    ],
  },
];

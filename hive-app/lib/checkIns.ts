import type { Community, SurveyQuestion } from '../types';

/**
 * OG HIVE's tune-ups were designed around OG's monthly rhythm. Other HIVEs get
 * their own check-ins only after their cadence, questions, newsletter use, and
 * privacy boundaries are deliberately chosen.
 *
 * Reworded 2026-08-12 to name the MONTHLY rhythm: the quarterly and
 * end-of-year check-ins are real for every HIVE now (see the season block
 * below), so "check-ins are coming soon" stopped being true the day they
 * shipped. Every surface this message gates is a monthly/tune-up flow.
 */
export const CHECK_INS_COMING_SOON_MESSAGE =
  "Coming soon — the monthly tune-up will be designed around this HIVE’s own rhythm.";

/**
 * OG HIVE keeps the original database slug from before multi-HIVE existed.
 * Tech HIVE joined the list on 2026-08-11, when Nat designed its own rhythm
 * out loud: monthly on the second Thursday evening (moved off the first
 * Thursday on 2026-08-12 so Tech lands right after OG's second Wednesday —
 * one HIVE week instead of two scattered ones), POP-centred check-ins,
 * networking instead of hangs, and the treasurer slide kept deliberately as
 * the place to talk about WHETHER Tech wants dues at all. Production still
 * waits for its own design.
 */
export function hasTailoredCheckIns(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return community?.slug === 'default' || community?.slug === 'tech';
}

/**
 * When Home nudges a member about the halfway check-in, and what it says.
 *
 * OG's halfway feeds the newsletter, which goes out on the 1st, so OG's
 * window rides the CALENDAR — the last five days of the month — and the copy
 * talks about the newsletter. That was the only shape until 2026-08-12.
 *
 * **Tech doesn't meet on a rhythm the calendar month describes.** When Tech
 * sat on the first Thursday, the end of the month was about the worst
 * possible moment to call something "halfway" — the nudge landed three or
 * four days before the meeting, not midway between two. Tech has since moved
 * to the second Thursday, which shifts the problem rather than removing it.
 * So Tech's window is measured from its own next meeting, whatever date that
 * turns out to be, and it keeps working if the day moves again. Tech's
 * halfway also has no newsletter step at all (pulse and shout-outs only), so
 * OG's copy promised Tech members something that isn't in their flow.
 *
 * A third HIVE is a third entry here, the same way the deck and the check-in
 * flows are third lists rather than third slug checks.
 */
export type HalfwayShape = {
  /** `month` = last 5 days of the calendar month. `cycle` = ~2 weeks out. */
  window: 'month' | 'cycle';
  emoji: string;
  detail: string;
};

const HALFWAY_BY_SLUG: Record<string, HalfwayShape> = {
  default: {
    window: 'month',
    emoji: '🗞️',
    detail: 'The newsletter goes out on the 1st — want a shout-out, a plug, or a reminder in it?',
  },
  tech: {
    window: 'cycle',
    emoji: '🫶',
    detail: "Halfway to the next meeting — how's it going, and who deserves a shout-out?",
  },
};

export function getHalfwayShape(
  community: Pick<Community, 'slug'> | null | undefined,
): HalfwayShape | null {
  return HALFWAY_BY_SLUG[community?.slug ?? ''] ?? null;
}

/**
 * Whether today sits in that HIVE's halfway nudge window.
 *
 * `nextMeetingDate` is only consulted for the `cycle` shape, and a HIVE with
 * no meeting on the books simply doesn't get nudged — better silent than
 * nudging about a halfway point to nothing.
 */
export function isInHalfwayWindow(
  shape: HalfwayShape,
  today: Date,
  nextMeetingDate?: string | null,
): boolean {
  if (shape.window === 'month') {
    const daysLeftInMonth =
      new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
    return daysLeftInMonth <= 4;
  }

  if (!nextMeetingDate) return false;
  const [year, month, day] = nextMeetingDate.split('-').map(Number);
  if (!year || !month || !day) return false;
  const meeting = new Date(year, month - 1, day);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilMeeting = Math.round(
    (meeting.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  );
  // Days 16 through 12 before the meeting — five days sitting squarely in the
  // middle of a monthly cycle, the same five-day length OG's window has.
  return daysUntilMeeting <= 16 && daysUntilMeeting >= 12;
}

/* ------------------------------------------------------------------------- *
 * The quarter and the year — the two slower check-ins.
 *
 * Nat, 2026-08-06: "check-ins should show the 3 days before the meeting, 3
 * days before the newsletter & 3 days before the end of the quarter & 3 days
 * before the end of the year." The monthly two have run for a while; these
 * two were listed in italics as coming soon until 2026-08-12, when they
 * became real. The italics did not outlive the promise.
 *
 * How they work, decided 2026-08-12:
 *
 * - Each occurrence is its own row in `surveys` — "Quarterly Check-in · Q3
 *   2026", "End-of-Year Check-in · 2026" — launched from Admin (the first
 *   occurrences, Q3 2026 and year-end 2026, were seeded for all three HIVEs
 *   by migration 172 so the rhythm starts without waiting). That reuses
 *   the whole existing survey machinery: members answer through the same
 *   card on Home and the same answer sheet as any survey, and the
 *   `check-in-reminder` cron only ever mails a HIVE that actually holds the
 *   active survey (the property that made the cron safe to leave running).
 *   No new table, no new column, no migration.
 *
 * - **December belongs to the year, not the quarter.** Q4's quarter-end and
 *   the year-end are the same three days, and asking somebody to reflect on
 *   the quarter and then the year in the same breath is the same question
 *   twice. So the quarterly runs March, June and September, and the
 *   end-of-year check-in takes December's slot. During Q4 the next
 *   quarterly is Q1 of the new year.
 *
 * - The card appears on Home three days before the quarter (or year) ends —
 *   Mar 28, Jun 27, Sep 27, Dec 28, computed from the calendar, never
 *   hardcoded — however early Nat launched the survey from Admin. Launching
 *   early is how she reads the questions in the app before members do.
 * ------------------------------------------------------------------------- */

export type SeasonKind = 'quarter' | 'year';

/** Days before the quarter/year end that the check-in opens and the cron nudges. */
export const SEASON_CHECK_IN_LEAD_DAYS = 3;

/** How the two season check-ins are recognised, wherever they travel.
 *  `supabase/functions/check-in-reminder` keeps its own copy of these (Deno
 *  can't import app code) — change one, change both. */
export const QUARTERLY_CHECK_IN_PATTERN = /quarterly\s+check-?in/i;
export const END_OF_YEAR_CHECK_IN_PATTERN = /end[-\s]of[-\s]year\s+check-?in/i;

/** One mark per rhythm on Home: the monthly wears 📋, these wear their own. */
export const SEASON_CHECK_IN_EMOJI: Record<SeasonKind, string> = {
  quarter: '🧭',
  year: '🎉',
};

/** Which season check-in a survey is, going only by its title — the same way
 *  the monthly check-in has always been recognised. */
export function getSeasonCheckInKind(
  survey: { title?: string | null } | null | undefined,
): SeasonKind | null {
  const title = survey?.title ?? '';
  if (END_OF_YEAR_CHECK_IN_PATTERN.test(title)) return 'year';
  if (QUARTERLY_CHECK_IN_PATTERN.test(title)) return 'quarter';
  return null;
}

/** One upcoming occurrence: which stretch of time it closes out, and when. */
export type SeasonOccurrence = {
  kind: SeasonKind;
  /** "Q3 2026" or "2026" — also the tail of the survey title, so Admin can
   *  tell whether THIS occurrence has been launched yet. */
  label: string;
  /** The last day of the quarter/year, as a local calendar date. */
  endDate: Date;
  /** The day the card appears and the cron nudges: endDate minus the lead. */
  opensDate: Date;
};

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

/**
 * The next quarterly occurrence on or after `today`. Q4 is deliberately not
 * one — see the block comment above: December belongs to the end-of-year
 * check-in, so from October onward the next quarterly is Q1 of the new year.
 */
export function getUpcomingQuarterOccurrence(today: Date): SeasonOccurrence {
  const quarterIndex = Math.floor(today.getMonth() / 3); // 0..3
  let year = today.getFullYear();
  let quarter = quarterIndex + 1; // 1..4
  if (quarter === 4) {
    quarter = 1;
    year += 1;
  }
  const endDate = lastDayOfMonth(year, quarter * 3 - 1);
  return {
    kind: 'quarter',
    label: `Q${quarter} ${year}`,
    endDate,
    opensDate: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - SEASON_CHECK_IN_LEAD_DAYS),
  };
}

/** The next end-of-year occurrence: this year's Dec 31, always ahead of today. */
export function getUpcomingYearOccurrence(today: Date): SeasonOccurrence {
  const year = today.getFullYear();
  const endDate = new Date(year, 11, 31);
  return {
    kind: 'year',
    label: `${year}`,
    endDate,
    opensDate: new Date(year, 11, 31 - SEASON_CHECK_IN_LEAD_DAYS),
  };
}

export function getUpcomingSeasonOccurrence(kind: SeasonKind, today: Date): SeasonOccurrence {
  return kind === 'quarter' ? getUpcomingQuarterOccurrence(today) : getUpcomingYearOccurrence(today);
}

/*
 * The question decks, one list per HIVE per season — the same declarative
 * shape as HALFWAY_BY_SLUG above, so a fourth HIVE is a fourth entry and
 * never a fourth slug check. A HIVE with no entry simply has no season
 * check-in yet, and Admin says so in italics.
 *
 * ALL WORDING BELOW IS A DRAFT (2026-08-12) FOR NAT TO READ IN THE RUNNING
 * APP — launch one from Admin and open it. Rewording happens by asking in
 * chat (the survey builder was killed the same day, Nat: "Survey builder?
 * kill it. We'll just chat here"); a launched row gets its words changed in
 * the database, and the next occurrence picks up whatever this table says at
 * launch time. Nothing is required: the monthly check-in made every question
 * optional and people finish it more, not less.
 */

const QUARTER_DESCRIPTION =
  'Three months went by — take five quiet minutes to look back before the next ones start. Short answers are perfect.';
const YEAR_DESCRIPTION =
  'The year is wrapping up. Look back with us, celebrate a little, and point at what comes next. Short answers are perfect.';

const q = (
  id: string,
  text: string,
  type: SurveyQuestion['type'] = 'long',
): SurveyQuestion => ({ id, text, type, required: false });

const QUARTER_QUESTIONS_BY_SLUG: Record<string, SurveyQuestion[]> = {
  // OG HIVE — lives and friendships, so the quarter is a chapter of life.
  default: [
    q('q_quarter_story', 'How did the last three months go? Tell it however it comes — highlights, lowlights, plot twists.'),
    q('q_quarter_proud', 'What are you proudest of from this quarter?'),
    q('q_quarter_heavy', 'What took more out of you than it should have?'),
    q('q_quarter_next', 'What do you want the next three months to hold?'),
    q('q_quarter_hive', 'Anything HIVE can do to make next quarter easier — or more fun?'),
    // Borrowed with love (Nat, 2026-08-13): the first three from The Culture
    // Code (belonging, shared struggle, after-action review), the brule from
    // Vishen Lakhiani — explained in the question because Nat is the only one
    // who read the book ("ahhaahha").
    q('q_quarter_belong', 'When did you feel most part of the HIVE this quarter?'),
    q('q_quarter_unsaid', "What did you struggle with this quarter that you didn't mention at the time?"),
    q('q_quarter_kct', 'Keep / change / try — name one thing to keep doing, one to change, and one to try next quarter.'),
    q('q_quarter_brule', 'A "brule" is a rule we follow without ever asking why — a bullshit rule (an idea from Vishen Lakhiani\'s The Code of the Extraordinary Mind). What brule are you ready to break next quarter?'),
    q('q_quarter_word', 'One word for the quarter.', 'short'),
  ],
  // Tech HIVE — building and learning, so the quarter is measured in what got made.
  tech: [
    q('q_quarter_shipped', 'What did you build, ship, or learn this quarter?'),
    q('q_quarter_proud', "What are you proudest of — even if nobody else saw it?"),
    q('q_quarter_stuck', 'Where did you stay stuck the longest, and what would have helped?'),
    q('q_quarter_next', 'What do you want to be true by the end of next quarter?'),
    q('q_quarter_hive', 'What could this HIVE do for you next quarter — an intro, a second pair of eyes, a nudge?'),
    // Borrowed with love (Nat, 2026-08-13): the first three from The Culture
    // Code (belonging, shared struggle, after-action review), the brule from
    // Vishen Lakhiani — explained in the question because Nat is the only one
    // who read the book ("ahhaahha").
    q('q_quarter_belong', 'When did you feel most part of the HIVE this quarter?'),
    q('q_quarter_unsaid', "What did you struggle with this quarter that you didn't mention at the time?"),
    q('q_quarter_kct', 'Keep / change / try — name one thing to keep doing, one to change, and one to try next quarter.'),
    q('q_quarter_brule', 'A "brule" is a rule we follow without ever asking why — a bullshit rule (an idea from Vishen Lakhiani\'s The Code of the Extraordinary Mind). What brule are you ready to break next quarter?'),
    q('q_quarter_word', 'One word for the quarter.', 'short'),
  ],
  // Production HIVE keeps the database slug `show`.
  show: [
    q('q_quarter_stage', 'What did you perform, book, or bring to life this quarter?'),
    q('q_quarter_proud', 'What moment are you proudest of — on stage or behind the scenes?'),
    q('q_quarter_wings', "What's been waiting in the wings that didn't get its moment yet?"),
    q('q_quarter_next', 'What are you building toward for the next three months?'),
    q('q_quarter_hive', 'How can this HIVE help you get there?'),
    // Borrowed with love (Nat, 2026-08-13): the first three from The Culture
    // Code (belonging, shared struggle, after-action review), the brule from
    // Vishen Lakhiani — explained in the question because Nat is the only one
    // who read the book ("ahhaahha").
    q('q_quarter_belong', 'When did you feel most part of the HIVE this quarter?'),
    q('q_quarter_unsaid', "What did you struggle with this quarter that you didn't mention at the time?"),
    q('q_quarter_kct', 'Keep / change / try — name one thing to keep doing, one to change, and one to try next quarter.'),
    q('q_quarter_brule', 'A "brule" is a rule we follow without ever asking why — a bullshit rule (an idea from Vishen Lakhiani\'s The Code of the Extraordinary Mind). What brule are you ready to break next quarter?'),
    q('q_quarter_word', 'One word for the quarter.', 'short'),
  ],
};

const YEAR_QUESTIONS_BY_SLUG: Record<string, SurveyQuestion[]> = {
  default: [
    q('q_year_headline', "Your headline for the year — the one-liner you'd tell an old friend.", 'short'),
    q('q_year_proud', 'What moment from this year are you proudest of?'),
    q('q_year_thanks', 'Who showed up for you this year? Name names — they might get a shout-out.'),
    q('q_year_release', 'What are you happily leaving behind with this year?'),
    q('q_year_wish_me', 'One wish for yourself next year.'),
    q('q_year_wish_hive', 'And one wish for the HIVE.'),
    // Nat, 2026-08-13: giving goes both ways — "i dont want it to be peopel
    // just expecting help."
    q('q_year_give_take', 'What did the HIVE give you this year — and what did you give it?'),
    q('q_year_cup', 'How full is your cup heading into the new year?', 'scale'),
  ],
  tech: [
    q('q_year_headline', 'Your year, in one line.', 'short'),
    q('q_year_proud', "What did you make this year that you're proudest of?"),
    q('q_year_growth', "What can you do now that you couldn't in January?"),
    q('q_year_thanks', 'Who helped you get there? Name names.'),
    q('q_year_next', 'What do you want to take a real swing at next year?'),
    q('q_year_wish_hive', 'One wish for this HIVE next year.'),
    // Nat, 2026-08-13: giving goes both ways — "i dont want it to be peopel
    // just expecting help."
    q('q_year_give_take', 'What did the HIVE give you this year — and what did you give it?'),
    q('q_year_cup', 'How charged is your battery heading into the new year?', 'scale'),
  ],
  show: [
    q('q_year_headline', 'Your year, in one line — the marquee version.', 'short'),
    q('q_year_proud', 'What was your favorite moment on stage this year? And your favorite one off it?'),
    q('q_year_growth', "What can you do now that you couldn't at the start of the year?"),
    q('q_year_thanks', 'Who deserves a standing ovation for showing up for you this year?'),
    q('q_year_next', "What's the dream booking, act, or project for next year?"),
    q('q_year_wish_hive', 'One wish for this HIVE next year.'),
    // Nat, 2026-08-13: giving goes both ways — "i dont want it to be peopel
    // just expecting help."
    q('q_year_give_take', 'What did the HIVE give you this year — and what did you give it?'),
    q('q_year_cup', 'How full is your tank heading into the new year?', 'scale'),
  ],
};

/** Whether this HIVE has a season deck designed at all. All three current
 *  HIVEs do (Nat named all three on the Trello card, 2026-08-12) — this
 *  exists so a brand-new HIVE fails closed into italics, not into OG's deck. */
export function hasSeasonCheckIns(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  const slug = community?.slug ?? '';
  return slug in QUARTER_QUESTIONS_BY_SLUG && slug in YEAR_QUESTIONS_BY_SLUG;
}

/** Everything Admin needs to insert one occurrence as a `surveys` row. */
export type SeasonCheckInTemplate = {
  title: string;
  description: string;
  questions: SurveyQuestion[];
  /** Stored the way every check-in due date is stored: midnight UTC of the
   *  day AFTER the real Pacific day, which renders as 5pm Pacific on the
   *  real day (see the timezone note in check-in-reminder/index.ts). */
  dueDateIso: string;
  occurrence: SeasonOccurrence;
};

export function buildSeasonCheckIn(
  community: Pick<Community, 'slug'> | null | undefined,
  kind: SeasonKind,
  today: Date,
): SeasonCheckInTemplate | null {
  const slug = community?.slug ?? '';
  const questions = (kind === 'quarter' ? QUARTER_QUESTIONS_BY_SLUG : YEAR_QUESTIONS_BY_SLUG)[slug];
  if (!questions) return null;

  const occurrence = getUpcomingSeasonOccurrence(kind, today);
  const { endDate } = occurrence;
  return {
    title: kind === 'quarter'
      ? `Quarterly Check-in · ${occurrence.label}`
      : `End-of-Year Check-in · ${occurrence.label}`,
    description: kind === 'quarter' ? QUARTER_DESCRIPTION : YEAR_DESCRIPTION,
    // A fresh copy per launch, so editing one occurrence never reaches back
    // into this table or forward into the next occurrence.
    questions: questions.map((question) => ({ ...question })),
    dueDateIso: new Date(Date.UTC(
      endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1,
    )).toISOString(),
    occurrence,
  };
}

/**
 * Whether a survey's card belongs on Home today.
 *
 * Ordinary surveys always do — that behaviour is untouched. A season
 * check-in keeps to its season: the card appears three days before the
 * quarter/year ends and quietly steps back two weeks after, because a nudge
 * about last quarter arriving deep into the new one is worse than silence.
 * (Launching from Admin can happen weeks early; this is what keeps the
 * member-facing moment on the calendar regardless.)
 */
export function isSurveyOnHomeToday(
  survey: { title?: string | null; due_date?: string | null },
  today: Date,
): boolean {
  if (!getSeasonCheckInKind(survey)) return true;
  if (!survey.due_date) return true;

  const due = new Date(survey.due_date);
  if (Number.isNaN(due.getTime())) return true;

  // The stored instant renders as 5pm local on the real end day, so the
  // local calendar date of `due` IS the quarter/year's last day.
  const endDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const opens = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - SEASON_CHECK_IN_LEAD_DAYS);
  const lingersUntil = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 14);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return startOfToday >= opens && startOfToday <= lingersUntil;
}

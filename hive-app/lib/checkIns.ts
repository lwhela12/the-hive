import type { Community, SurveyQuestion } from '../types';
import { hiveDisplayName } from './hiveBrand';

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
  "Coming soon — this HIVE’s check-ins will be designed around its own rhythm.";

/**
 * OG HIVE keeps the original database slug from before multi-HIVE existed.
 * Tech HIVE joined the list on 2026-08-11, when Nat designed its own rhythm
 * out loud: monthly on a Thursday evening, POP-centred check-ins, networking
 * instead of hangs, and the treasurer slide kept deliberately as the place to
 * talk about WHETHER Tech wants dues at all. Production still waits for its
 * own monthly design.
 *
 * The days, reset by Nat on 2026-09-03: **every HIVE now meets in the second
 * week of the month.** Tech takes the SECOND TUESDAY, 6-8pm on Google Meet;
 * OG the second Wednesday; the third the second Thursday. Her reason was one
 * calendar to hold in her head — *"it helps me streamline communication if all
 * HIVEs meet the 2nd week of the month (ish)"*.
 *
 * Tech was the first Thursday, 5-7pm until that morning, which is what its
 * first-ever meeting was scheduled for before it moved. No day of the week is
 * hardcoded anywhere in this file; everything below reads the real meeting
 * date, which is what made moving a HIVE a calendar edit rather than a
 * code change.
 */
export function hasTailoredCheckIns(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return community?.slug === 'default' || community?.slug === 'tech';
}

/**
 * Whether this HIVE's HALFWAY nudge opens the tune-up wizard.
 *
 * **A third question, and Production is why it exists.** The screen used to
 * ask `hasTailoredCheckIns` once, for both of its modes, so the pre-meeting
 * tune-up and the halfway one stood behind a single door. Production needs the
 * halfway open (it is OG's, copied, and it goes out with the newsletter) and
 * the pre-meeting one shut — Nat, 2026-08-28: *"Pro HIVE's pre-meeting survey
 * will be unique, so we'll talk about that closer to the meeting."*
 *
 * One boolean could not say that. Opening `hasTailoredCheckIns` to `show`
 * would have handed Production OG's ARRIVAL/ENERGY/POP deck as well — the
 * exact interview she rejected — through a door nobody meant to open.
 *
 * Read off `HALFWAY_BY_SLUG` rather than a fourth slug list, so a HIVE whose
 * halfway shape says `flow: 'tuneup'` is a HIVE whose halfway wizard opens,
 * and the two can never drift into disagreeing.
 */
export function hasHalfwayTuneup(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return getHalfwayShape(community)?.flow === 'tuneup';
}

/**
 * Whether this HIVE has a meeting deck of its own.
 *
 * This used to be the same question as `hasTailoredCheckIns()`, and the Meeting
 * Helper gated on that one boolean. **They are two different questions**, and
 * Production HIVE is what proved it: on 2026-08-14 Nat designed Production's
 * meeting out loud — talk the group through the research site, then decide
 * cadence, then HIVE Help, then treasurer, then who goes to look at venues,
 * then hand out the jobs — while Production's monthly check-in survey is
 * *still* undesigned and deliberately off.
 *
 * A HIVE can know exactly how its meeting runs and not yet know what to ask
 * people beforehand. Tying the deck to the survey would have forced her to
 * design a survey she doesn't want yet just to get the meeting she does.
 */
export function hasMeetingDeck(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return (
    community?.slug === 'default'
    || community?.slug === 'tech'
    || community?.slug === 'show'
  );
}

/**
 * When Home nudges a member about the halfway check-in, and what it says.
 *
 * OG's halfway feeds the newsletter, which goes out on the 1st, so OG's
 * window rides the CALENDAR — the last three days of the month — and the copy
 * talks about the newsletter. That was the only shape until 2026-08-12.
 *
 * **Tech doesn't meet on a rhythm the calendar month describes.** Tech sits on
 * the SECOND TUESDAY, 6-8pm on Google Meet (moved there 2026-09-03), which
 * makes the end of the month about the worst possible moment to call something
 * "halfway" — the nudge would land nearly three weeks after the meeting, not
 * midway between two. So Tech's window is measured from its own next meeting,
 * whatever date that turns out to be, and it keeps working when the day moves.
 *
 * That last part earned its keep the morning Tech moved: the day of the week
 * changed, the hour changed, and nothing in this file needed touching except
 * the words a member reads.
 * Tech's halfway also has no newsletter step at all (pulse and shout-outs
 * only), so OG's copy promised Tech members something that isn't in their flow.
 *
 * A third HIVE is a third entry here, the same way the deck and the check-in
 * flows are third lists rather than third slug checks.
 */
export type HalfwayShape = {
  /** `month` = last 3 days of the calendar month. `cycle` = ~2 weeks out. */
  window: 'month' | 'cycle';
  emoji: string;
  detail: string;
  /**
   * Where the halfway nudge actually goes.
   *
   * `tuneup` is OG and Tech's guided wizard at `/monthly-tuneup?mode=midpoint`.
   * `survey` is a HIVE whose halfway IS a check-in survey, which already has
   * its own card on Home — Production works that way on purpose (the note on
   * `hasTailoredCheckIns` above, and the same call written out in Admin's
   * check-in schedule). Saying so here is what stops a second Home card being
   * offered for a door that would answer "coming soon".
   */
  flow: 'tuneup' | 'survey';
};

const HALFWAY_BY_SLUG: Record<string, HalfwayShape> = {
  default: {
    window: 'month',
    emoji: '🗞️',
    detail: 'The newsletter goes out on the 1st — want a shout-out, a plug, or a reminder in it?',
    flow: 'tuneup',
  },
  tech: {
    window: 'cycle',
    emoji: '🫶',
    detail: "Halfway to the next meeting — how's it going, and who deserves a shout-out?",
    flow: 'tuneup',
  },
  /**
   * Production HIVE keeps the database slug `show`.
   *
   * Nat, 2026-08-27: *"OG and Production HIVE are on the same cadence because
   * they meet kind of in the middle of the month."* So Production rides the
   * CALENDAR exactly the way OG does — the last five days of the month — and
   * the newsletter ask belongs in it, because the newsletter goes out on the
   * 1st for every HIVE, not only OG's.
   *
   * **Its door is OG's halfway wizard, not a survey.** This said
   * `flow: 'survey'` for one day, and that one value is what made Production's
   * halfway diverge into an interview: Newsletter → To-dos → HIVE Help became
   * arrival, energy, POP and three blank prose boxes. Nat, 2026-08-27, opening
   * it: *"this looks like the three days before the meeting, and there's no
   * HIVE Help. This is all bad."* And then the instruction this entry now
   * obeys: *"The OG HIVE halfway check-in is perfect. Can you just do that for
   * Production HIVE? Why can't you just copy the same thing? Why is it
   * different?"*
   *
   * So it is the same shape as `default`, to the letter. The only thing
   * Production wears of its own is its costume — purple and the clapperboard,
   * off `hiveBrand` / `_shared/hiveMark.ts`, never a second flow.
   */
  show: {
    window: 'month',
    emoji: '🗞️',
    detail: 'The newsletter goes out on the 1st — want a shout-out, a plug, or a reminder in it?',
    flow: 'tuneup',
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
    // The LAST THREE DAYS — 28, 29, 30 in September. Nat, 2026-09-02, reading
    // the grid: *"that should be three... 28, 29, 30 is when that should go
    // out. And then I use that information to inform what I'm going to add to
    // the Buzz, and then the Buzz goes out on the 1st."*
    //
    // This said five days until then, and the EMAIL never did — the halfway
    // letter has always fired on the 3rd-to-last day (`newsletterCheckInDate`,
    // check-in-reminder). So the card on Home appeared two days before the
    // letter that explains it. Three here means the two now agree.
    return daysLeftInMonth <= 2;
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

/**
 * Days before the quarter/year END that the check-in opens and the cron nudges.
 *
 * A DEADLINE, counted exclusively: the 1st of October is not a day anybody
 * fills in a check-in, so the three days that matter are the three before it.
 * Matches `getWindowOpenDate` in check-in-reminder.
 */
export const SEASON_CHECK_IN_LEAD_DAYS = 3;

/**
 * Days before a MEETING that its check-in appears on Home.
 *
 * Two, not three, because the window is three days long and the last of them is
 * the meeting itself. Nat, 2026-09-02: *"three days before but counting the
 * day... if Production meets on September 10th, then three days before that is
 * 10, 9, 8."*
 *
 * This exists as its own number because the invariant underneath it is worth
 * more than the saving of sharing one: **what lands in the inbox and what
 * appears on Home happen on the same morning.** The email moved to
 * `getMeetingWindowOpenDate` (meeting − 2) on 2026-09-02 and this did not,
 * which put Production's card on Home a day before the letter that explains it
 * — the exact gap the halfway had for weeks.
 */
export const PRE_MEETING_LEAD_DAYS = 2;

/**
 * How the two season check-ins are recognised, wherever they travel.
 *
 * This used to be a second copy of the regexes in the email function, with
 * "change one, change both" written on both of them. There is one copy now, in
 * `supabase/functions/_shared/checkInPatterns.ts` — a folder every edge
 * function deploy uploads, and one the app reaches perfectly well from here.
 * Re-exported so nothing that already imports them from this file has to move.
 */
export {
  QUARTERLY_CHECK_IN_PATTERN,
  END_OF_YEAR_CHECK_IN_PATTERN,
} from '../supabase/functions/_shared/checkInPatterns';
import {
  QUARTERLY_CHECK_IN_PATTERN,
  END_OF_YEAR_CHECK_IN_PATTERN,
} from '../supabase/functions/_shared/checkInPatterns';

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
    q('q_quarter_story', 'How did the last three months — {months} — go? Tell it however it comes: highlights, lowlights, plot twists.'),
    q('q_quarter_proud', 'What are you proudest of from this quarter?'),
    q('q_quarter_heavy', 'What took more out of you than it should have?'),
    q('q_quarter_unsaid', "What did you struggle with this quarter that you didn't mention at the time?"),
    q('q_quarter_next', 'What do you want the next three months to hold?'),
    q('q_quarter_hive', 'Anything HIVE can do to make next quarter easier — or more fun?'),
    // Borrowed with love (Nat, 2026-08-13): the first three from The Culture
    // Code (belonging, shared struggle, after-action review), the brule from
    // Vishen Lakhiani — explained in the question because Nat is the only one
    // who read the book ("ahhaahha").
    q('q_quarter_belong', 'When did you feel most part of the HIVE this quarter?'),
    // Spelled out as three blanks (Nat 8/13: "Keep: ___, Change: ___, Try: ___").
    q('q_quarter_keep', 'Keep: one thing that worked — keep doing it.', 'short'),
    q('q_quarter_change', 'Change: one thing that needs to be different.', 'short'),
    q('q_quarter_try', 'Try: one new thing for next quarter.', 'short'),
    q('q_quarter_brule', 'A "brule" is a rule we follow without ever asking why — a bullshit rule (an idea from Vishen Lakhiani\'s The Code of the Extraordinary Mind). What brule are you ready to break next quarter?'),
    // The app prints the member's own 3MIQ under this question — never homework.
    q('q_quarter_miq', 'Your 3 Most Important Questions, as you wrote them, are below. Did this quarter move any of them? What changed?'),
    q('q_quarter_word', 'One word for the quarter.', 'short'),
  ],
  // Tech HIVE — building and learning, so the quarter is measured in what got made.
  tech: [
    q('q_quarter_shipped', 'What did you build, ship, or learn this quarter ({months})?'),
    q('q_quarter_proud', "What are you proudest of — even if nobody else saw it?"),
    q('q_quarter_stuck', 'Where did you stay stuck the longest, and what would have helped?'),
    q('q_quarter_unsaid', "What did you struggle with this quarter that you didn't mention at the time?"),
    q('q_quarter_next', 'What do you want to be true by the end of next quarter?'),
    q('q_quarter_hive', 'What could this HIVE do for you next quarter — an intro, a second pair of eyes, a nudge?'),
    // Borrowed with love (Nat, 2026-08-13): the first three from The Culture
    // Code (belonging, shared struggle, after-action review), the brule from
    // Vishen Lakhiani — explained in the question because Nat is the only one
    // who read the book ("ahhaahha").
    q('q_quarter_belong', 'When did you feel most part of the HIVE this quarter?'),
    // Spelled out as three blanks (Nat 8/13: "Keep: ___, Change: ___, Try: ___").
    q('q_quarter_keep', 'Keep: one thing that worked — keep doing it.', 'short'),
    q('q_quarter_change', 'Change: one thing that needs to be different.', 'short'),
    q('q_quarter_try', 'Try: one new thing for next quarter.', 'short'),
    q('q_quarter_brule', 'A "brule" is a rule we follow without ever asking why — a bullshit rule (an idea from Vishen Lakhiani\'s The Code of the Extraordinary Mind). What brule are you ready to break next quarter?'),
    // The app prints the member's own 3MIQ under this question — never homework.
    q('q_quarter_miq', 'Your 3 Most Important Questions, as you wrote them, are below. Did this quarter move any of them? What changed?'),
    q('q_quarter_word', 'One word for the quarter.', 'short'),
  ],
  // Production HIVE keeps the database slug `show`.
  show: [
    q('q_quarter_stage', 'What did you perform, book, or bring to life this quarter ({months})?'),
    q('q_quarter_proud', 'What moment are you proudest of — on stage or behind the scenes?'),
    q('q_quarter_wings', "What's been waiting in the wings that didn't get its moment yet?"),
    q('q_quarter_unsaid', "What did you struggle with this quarter that you didn't mention at the time?"),
    q('q_quarter_next', 'What are you building toward for the next three months?'),
    q('q_quarter_hive', 'How can this HIVE help you get there?'),
    // Borrowed with love (Nat, 2026-08-13): the first three from The Culture
    // Code (belonging, shared struggle, after-action review), the brule from
    // Vishen Lakhiani — explained in the question because Nat is the only one
    // who read the book ("ahhaahha").
    q('q_quarter_belong', 'When did you feel most part of the HIVE this quarter?'),
    // Spelled out as three blanks (Nat 8/13: "Keep: ___, Change: ___, Try: ___").
    q('q_quarter_keep', 'Keep: one thing that worked — keep doing it.', 'short'),
    q('q_quarter_change', 'Change: one thing that needs to be different.', 'short'),
    q('q_quarter_try', 'Try: one new thing for next quarter.', 'short'),
    q('q_quarter_brule', 'A "brule" is a rule we follow without ever asking why — a bullshit rule (an idea from Vishen Lakhiani\'s The Code of the Extraordinary Mind). What brule are you ready to break next quarter?'),
    // The app prints the member's own 3MIQ under this question — never homework.
    q('q_quarter_miq', 'Your 3 Most Important Questions, as you wrote them, are below. Did this quarter move any of them? What changed?'),
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
  // "hearing 'how did the last 3 months go' i'm like uhhhhhhh" (Nat,
  // 2026-08-13) — the opener names its months, so the {months} token in a
  // deck becomes "July, August and September" for that occurrence.
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const quarterMonths = kind === 'quarter'
    ? `${monthNames[endDate.getMonth() - 2]}, ${monthNames[endDate.getMonth() - 1]} and ${monthNames[endDate.getMonth()]}`
    : '';
  return {
    title: kind === 'quarter'
      ? `Quarterly Check-in · ${occurrence.label}`
      : `End-of-Year Check-in · ${occurrence.label}`,
    description: kind === 'quarter' ? QUARTER_DESCRIPTION : YEAR_DESCRIPTION,
    // A fresh copy per launch, so editing one occurrence never reaches back
    // into this table or forward into the next occurrence.
    questions: questions.map((question) => ({ ...question, text: question.text.replace('{months}', quarterMonths) })),
    dueDateIso: new Date(Date.UTC(
      endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1,
    )).toISOString(),
    occurrence,
  };
}

/* ------------------------------------------------------------------------- *
 * The pre-meeting check-in — questions answered BEFORE a meeting so the
 * meeting itself can decide.
 *
 * Nat, 2026-08-14, walking Production's new meeting deck: "Let's do the
 * monthly, the pre-meeting check-in for sure. It's always good to know
 * people's energy and how much they have on their plate before going to a
 * meeting." And then the reason it matters more than mood: "We can put the
 * 'how often do you want to meet' and the HIVE Help questions in the
 * pre-production meeting survey… Should we have a Honey Pot? Do you want to
 * have dues? How much? Do you want to be treasurer? That information can kind
 * of precede the meeting helper, and then we can decide things."
 *
 * So this deck carries two jobs at once: the arrival questions (name, energy,
 * plate) that set the room, and the standing decisions (cadence, Honey Pot,
 * treasurer, HIVE Help, venues) that the meeting would otherwise spend its
 * hour collecting out loud.
 *
 * It is an ORDINARY survey row, deliberately. Production's Home card, the
 * answer sheet and the response history all already work for those; the
 * `monthly-tuneup` wizard is OG HIVE's own ritual (wishes → hangs → calendar
 * → helpers) and `hasTailoredCheckIns()` keeps Production out of it on
 * purpose. **The title must stay clear of the words this app uses to spot the
 * rhythm check-ins** — `isMonthlyCheckInSurvey()` in `lib/hooks/useSurveys.ts`
 * matches "monthly check-in" in the title OR the description, and a match
 * would send the Home card into that wizard and land Production members on
 * "coming soon".
 *
 * A fourth HIVE is a fourth entry here, the same as every other deck above.
 * ------------------------------------------------------------------------- */

/** The ids this deck writes, named once so the meeting deck reads answers by
 *  the same key the survey stores them under. */
export const PRE_MEETING_QUESTION_IDS = {
  nameToday: 'q_name_today',
  attendance: 'q_attendance',
  /** A member's own leaving time. It never sets the HIVE's official meeting end. */
  hardOut: 'q_hard_out',
  energyLevel: 'q_energy_level',
  plate: 'q_plate',
  cadence: 'q_cadence',
  when: 'q_when',
  honeyPot: 'q_honey_pot',
  honeyPotAmount: 'q_honey_pot_amount',
  treasurer: 'q_treasurer',
  hiveHelp: 'q_hive_help',
  // venueVisit removed 2026-08-15 — the venues get assigned live in the
  // meeting, after the presentation that explains why any of them matter.
  whoCanKnow: 'q_who_can_know',
  whoMustNotHear: 'q_who_must_not_hear',
  biggestQuestion: 'q_biggest_question',
  walkAway: 'q_walk_away',
} as const;

export type PreMeetingQuestionId =
  (typeof PRE_MEETING_QUESTION_IDS)[keyof typeof PRE_MEETING_QUESTION_IDS];

export type PreMeetingCheckIn = {
  title: string;
  description: string;
  questions: SurveyQuestion[];
};

/**
 * A block that explains instead of asking.
 *
 * Nat, 2026-09-01, scrolling Tech's rebuilt check-in and finding four prose
 * boxes in a row: *"I want it more obvious, like, explaining how the HIVE's
 * work. Like saying that the purpose of the HIVE is helping all of us achieve
 * our goals/higher purpose. Explain what a Highdefinition wish is & that we go
 * over them in our 'hummdinger sessions' and we use formulas like POP &
 * where are you where do you want to be/where are you stuck/what have you
 * tried to help aid you in your quest."*
 *
 * A question with no context is a chore. The same question under a paragraph
 * saying what it is for is a conversation. It stores no answer and takes no
 * number.
 */
const note = (id: string, text: string, body: string[]): SurveyQuestion => ({
  id,
  text,
  type: 'note',
  body,
  required: false,
});

const choice = (id: string, text: string, options: string[]): SurveyQuestion => ({
  id,
  text,
  type: 'choice',
  options,
  required: false,
});

/**
 * The same optional personal-availability question in every HIVE's
 * pre-meeting check-in. Its stable id preserves existing answers. It is never
 * the Meeting Helper's official countdown target; that lives on `communities`.
 */
export const PERSONAL_HARD_OUT_QUESTION: SurveyQuestion = {
  id: PRE_MEETING_QUESTION_IDS.hardOut,
  text: 'Do you have a hard out? If so, what time?',
  type: 'short',
  required: false,
};

const PRE_MEETING_BY_SLUG: Record<string, PreMeetingCheckIn> = {
  // Production HIVE keeps the database slug `show`. This is the RECURRING
  // check-in — the first meeting's one-time questions (cadence, Honey Pot,
  // who-can-know, walk-away lines) were asked and answered on 2026-08-18; the
  // full set and its reasoning live in the brain folder's receipts and on the
  // answered survey row. Recurring Production check-ins work from the live
  // project: completed jobs and open assignments are pre-seeded from the
  // to-do rows, while attendance, hard-out and capacity are the only questions.
  // Updates belong on their board threads, not in a parallel survey account.
  show: {
    title: 'Before we meet',
    description:
      'Review your Production HIVE jobs, tick off what is done, then tell the room whether you are coming and how much room you have.',
    questions: [
      choice('q_attendance', 'Will we see you at this one?', [
        "🐝 I'll be there in person",
        '💻 Joining remotely',
        '😢 Missing this one — please email me the recap',
      ]),
      { ...PERSONAL_HARD_OUT_QUESTION },
      choice('q_plate', 'How much is on your plate right now?', [
        '🍽️ Plenty of room — hand me something',
        "🥄 A bit on there, and I've got room for this",
        "🍲 Pretty full — I'll take one small thing",
        '🫙 Full to the brim — I want to listen this time',
      ]),
    ],
  },
  /**
   * Tech HIVE's first night, rebuilt on 2026-09-01.
   *
   * The version this replaced asked twelve questions and only four of them
   * reached the room. Nat stopped the send over it: *"where do those all go?
   * are they all populating on the meeting helper? cos remember our strict
   * rule: we dont ask questions unless we're doing something with the
   * answers."* Eight were readable in Admin and nowhere else, and two made a
   * promise in their own wording that nothing kept.
   *
   * Then she named what this actually is: *"maybe the first meeting survey
   * walks you through filling out your profile and stuff?"* It is ONBOARDING.
   * It fills your honeycomb, it seeds your HummDinger, and it votes on how the
   * HIVE runs — and every answer becomes a THING on the night, never a wall of
   * quotes and never a summary.
   *
   * **The order is the meeting's order, with one deliberate departure.** The
   * night runs Arrivals → News → Honey Pot → Plan → HummDinger, and the votes
   * follow it exactly, so the numbers appear on screen in the order they were
   * asked. Arrivals opens with three quick taps.
   *
   * The HummDinger block does NOT wait for its slot. It is last on the night
   * because it is the best part and wants a warmed-up room; in a survey, last
   * means answered tired, and the HD wish is the one question here that takes
   * real thought. Nat asked whether to match the meeting exactly
   * (2026-09-01) — everything else does.
   *
   * Where each one lands, which is the only reason each one is here:
   *
   * | question | where it shows up |
   * |---|---|
   * | q_attendance | the Arrival Board, and the sealed summary |
   * | q_hd_wish | a real `wishes` row, filed as your spotlight — your profile, your member card, and "This month's HD" on your bubble |
   * | q_meeting_day | a percentage on the Plan slide's HIVE Meeting card |
   * | q_hive_help | a percentage on the Plan slide's HIVE Help card |
   * | q_networking | the events box under the Plan cards |
   * | q_honey_pot / q_honey_pot_for | the two vote bars on the Honey Pot slide |
   * | q_energy_level | the energy dots on your arrival card |
   * | q_hard_out | your arrival card, and the summary |
   *
   * **The choice options here are copied verbatim from the deck.** The deck
   * counts an answer by matching its text, so a comma or a straight quote in
   * the wrong place splits one vote into two. `scripts/lint-tech-check-in.mjs`
   * compares the two files character by character and fails the build if they
   * ever drift.
   *
   * Cut, deliberately: `q_who_can_know` (a Production question — that HIVE is
   * building a show in public, this one is not), `q_plate` (energy already
   * asks it), `q_cadence` + `q_when` (replaced by the day vote, which comes
   * back as a percentage instead of prose), and `q_learned`, which said its
   * answer could go "straight on the Things We Learned board" while nothing
   * posted it. That one comes back the day it does.
   *
   * **And `q_building`.** It fed the intro bubble, and Nat cut it the same
   * afternoon: *"I think we should just say that we'll do intro's. Or i can
   * just tell everyone to give us a 30sec. elevator pitch of who they are
   * before going into their HD; i dont think you need to write down who you
   * are? we all know that answer."* The bubble already falls back to
   * "introduce yourself — 30 seconds" with nothing written, which is exactly
   * the prompt she wants on screen while somebody talks.
   *
   * **And the POP questions, which is the important one.** `q_pop_progress`,
   * `q_pop_obstacles` and `q_pop_priorities` were in here for a day, one box
   * each, and Nat cut them: *"the survey will help you generate some HD
   * wishes, if you havent yet & then you pick one for this months focus & just
   * know that the purpose of the HD sesh is to talk through it and see if
   * anyone can help you out... so i dont think people need to type out the
   * answers to where are you where do you want to be, etc, i think thats the
   * purpose of the live sesh. But — they DO want to have an HD wish to focus
   * on."*
   *
   * The frame is not gone; it moved to where it works. The HummDinger slide
   * already prints it as a legend across the top of the room
   * (`POP_SECTIONS` / `POP_ALT_PHRASING` in meeting-helper.tsx), and the live
   * note under each bubble catches what gets said. A member arrives with one
   * wish written down, the way OG members do, and the talking is the meeting.
   * The deck still reads `q_pop_*` for any HIVE whose check-in asks them;
   * Tech's simply does not, and those sections stay out of the way.
   */
  tech: {
    title: 'Before our first meeting',
    description:
      'Tuesday September 8th, 6–8pm, on Google Meet — our first Tech HIVE. What you write here fills your spot in the room: your intro, what you are working on, and how we run this thing. Short answers are perfect, and blanks are completely fine.',
    questions: [
      choice('q_attendance', 'Will we see you Tuesday?', [
        "💻 I'll be on the call",
        "🐝 Can't make this one — but I still want to be in the group",
        '🤔 Not sure yet',
      ]),
      { id: 'q_energy_level', text: 'Energy: what is your energy level right now?', type: 'scale', required: false },
      { ...PERSONAL_HARD_OUT_QUESTION },
      note('note_what_a_hive_is', 'What a HIVE is for', [
        'We are here to get each other somewhere. A HIVE is a small group that puts real weight behind what each of us is actually chasing — the goal, and the bigger thing underneath it.',
        'The way we do that is a High Definition wish: one ask, said clearly enough that somebody in this room could grant it. "Look at my landing page and tell me why nobody signs up" is an HD.',
        'Pick one below as your focus for the month. It goes on your profile and your member card, and it comes up on screen on the night as yours.',
        'That is what a HummDinger session is. We take one HD at a time and talk it through — where are you, where do you want to be, what have you tried, where are you stuck — and find out who can help.',
        'Tuesday opens with introductions. We will go round, and then we get into the HummDingers.',
      ]),
      // The one that becomes a real `wishes` row on submit, filed as the
      // spotlight, so the bubble has an HD on it before anybody speaks.
      q('q_hd_wish', 'Your High Definition wish — the one you want this room working on this month.'),
      note('note_how_we_run', 'Now — how we run this', [
        'Tech HIVE is new, so the rest is ours to set. These come back as the actual numbers on screen Tuesday, in this order, and we decide from there.',
      ]),
      choice(
        'q_honey_pot',
        'Some HIVEs keep a Honey Pot and some do not. OG HIVE’s is $25 a quarter per member, spent however the HIVE decides — hoodies this fall, maybe a Bumblebee Ball to close the year. Want one here?',
        [
          'Yes — count me in',
          'Maybe — talk me through it',
          'Let’s leave it for now',
        ],
      ),
      choice('q_honey_pot_for', 'If we had one, what should it go toward first?', [
        'Tech HIVE hoodies',
        'A Bumblebee Ball',
        'Tools or subscriptions we all use',
        'I have another idea — I’ll bring it Tuesday',
      ]),
      choice('q_meeting_day', 'Which evening suits you best for our monthly call?', [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'A weekend',
      ]),
      choice('q_hive_help', 'Some HIVEs pick one small act of kindness to do together each month. Want one here?', [
        'Yes — I’m in',
        'Show me what it looks like',
        'Let’s leave it for now',
      ]),
      q('q_networking', 'Any tech events or meetups on your radar we could go to together?', 'short'),
    ],
  },
};

/** The title a NEW pre-meeting occurrence is launched under. */
export const PRE_MEETING_RECURRING_TITLE = 'Before we meet';

/**
 * Every meeting AFTER the first one.
 *
 * Nat, 2026-08-15, correcting a mix-up we had both made: *"pre-meeting is what
 * did you get done, how are you feeling, how much energy do you have to take on
 * for new stuff. And then end of the month is a halfway check-in and getting
 * stuff ready for the newsletter."*
 *
 * The POP lives HERE, not on the end-of-month one. This is the check-in that
 * drives a meeting: *"that way at the Pro HIVE meeting, okay, Charlee called
 * Circus Center and that is loaded here, and Ollie did this and that is here,
 * and that helps us move things forward."*
 *
 * The first meeting keeps its own deck above — nobody has done a job yet, so
 * "what did you get done" has no answer, and that night is for deciding how the
 * HIVE runs instead. From the second meeting on, this is the one.
 */
const PRE_MEETING_RECURRING_BY_SLUG: Record<string, PreMeetingCheckIn> = {
  show: {
    title: PRE_MEETING_RECURRING_TITLE,
    description:
      'Three minutes before we meet: where your jobs got to, how you are, and how much you can take on. It is what the meeting runs off.',
    questions: [
      q('q_name_today', 'What do you want to be called at this one?', 'short'),
      choice('q_attendance', 'Will we see you?', [
        "\u{1F41D} I'll be there in person",
        '\u{1F4BB} Joining remotely',
        '\u{1F622} Missing this one — please email me the recap',
      ]),
      // Personal availability is shown on this member's arrival card. It is
      // deliberately only a survey answer; the Meeting Helper's countdown
      // reads the HIVE's separate `communities.meeting_hard_out` setting.
      { ...PERSONAL_HARD_OUT_QUESTION },
      { id: 'q_energy_level', text: 'Energy: what is your energy level right now?', type: 'scale', required: false },
      // Arrives pre-filled with the to-dos this person ticked off since the
      // last meeting (SurveyModal). The wording says so, because text you did
      // not type appearing in a box is alarming unless something explains it.
      q('q_show_progress', 'What did you get done since we last met? Anything you ticked off is already here — add whatever else you did.', 'long'),
      q('q_show_obstacles', "What's stuck, and what would unstick it?", 'long'),
      choice('q_plate', 'How much can you take on this time?', [
        '\u{1F37D}\u{FE0F} Plenty of room — hand me something',
        "\u{1F944} A bit on there, and I've got room for this",
        "\u{1F372} Pretty full — I'll take one small thing",
        '\u{1FADA} Full to the brim — I want to listen this time',
      ]),
      q('q_show_raise', 'Anything you want us to talk about?', 'long'),
    ],
  },
};

/** The deck for a HIVE's SECOND and later meetings, when it has one. */
export function getRecurringPreMeetingCheckIn(
  community: Pick<Community, 'slug'> | null | undefined,
): PreMeetingCheckIn | null {
  return PRE_MEETING_RECURRING_BY_SLUG[community?.slug ?? ''] ?? null;
}

/** Whether this HIVE has a pre-meeting deck written for it. */
export function hasPreMeetingCheckIn(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return (community?.slug ?? '') in PRE_MEETING_BY_SLUG;
}

/** The deck itself — title, description and questions — ready to become a
 *  `surveys` row, or to be read back for its ids. */
export function getPreMeetingCheckIn(
  community: Pick<Community, 'slug'> | null | undefined,
): PreMeetingCheckIn | null {
  return PRE_MEETING_BY_SLUG[community?.slug ?? ''] ?? null;
}

/**
 * HOW A CHECK-IN IS RECOGNISED, AND WHY IT IS A PATTERN AND NOT A LIST.
 *
 * These two are transcriptions of `PRE_MEETING_CHECK_IN_PATTERN` and
 * `END_OF_MONTH_CHECK_IN_PATTERN` in
 * `supabase/functions/_shared/checkInPatterns.ts`, which is where the edge
 * functions read the same truth. The app cannot import that file — tsconfig
 * excludes `supabase/functions`, because it is Deno — so `npm run
 * lint:check-in-kinds` compares the two copies on every build and fails if
 * they ever stop being the same sentence. (`230_one_check_in_of_a_kind.sql`
 * holds a third transcription, in Postgres, and the same lint watches it.)
 *
 * **They used to be a list of exact titles, and that is how Production ended
 * up with two "End of the month" items on Home.** Its live row was still
 * called "Halfway check-in" — a retired name the row keeps as an internal
 * identifier, which `checkInDisplayName` below deliberately prints as "End of
 * the month". So the LABEL said end-of-the-month and the MATCHER said no, and
 * every rule written as "if this is the end-of-month row, the wizard owns the
 * door" silently did not apply to the one row it was about. Nat,
 * 2026-09-04: *"i dunno how thats still happening... so i dunno how there is
 * stil a duplicate?"*
 *
 * A pattern cannot drift from the name on screen the way a list can, because
 * `checkInDisplayName` is a pattern too and now they are the same one.
 */
const PRE_MEETING_TITLE_PATTERN = /before (our first meeting|we meet)/i;
const END_OF_MONTH_TITLE_PATTERN =
  /(end of the month|where the show got to this month|pro hive pop|halfway check-?in)/i;

/**
 * Whether a survey row is a pre-meeting check-in, going by its title — the
 * same way every other check-in is recognised.
 *
 * `community` is accepted for the callers that have one and reads naturally at
 * the call site, but it no longer narrows anything: a HIVE's pre-meeting
 * check-in and the shared one are the same ritual under the same two names, so
 * asking "is this Tech's?" and "is this one?" have the same answer. It was a
 * narrowing list until 2026-09-04, and the note that used to live here — Tech
 * having worked only because every caller happened to omit the community — is
 * the argument for it not being one.
 */
export function isPreMeetingCheckInSurvey(
  survey: { title?: string | null } | null | undefined,
  _community?: Pick<Community, 'slug'> | null,
): boolean {
  return PRE_MEETING_TITLE_PATTERN.test((survey?.title ?? '').trim());
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
  survey: { title?: string | null; due_date?: string | null; community_id?: string | null },
  today: Date,
): boolean {
  /**
   * A HIVE's OWN check-ins keep to their own dates too.
   *
   * Nat, 2026-08-15, looking at her to-do list three days before the first
   * Production meeting: *"the only survey in the to do right now should be
   * this 'pre meeting' one we're working on."* Instead it held "Where the show
   * got to this month", which is not due until the 31st.
   *
   * Both were launched the same afternoon, and nothing was telling them apart
   * — only the quarterly and the end-of-year had a season, so everything else
   * showed from the moment it existed. A check-in that sits in your to-do for
   * a fortnight before it means anything teaches you to ignore your to-do.
   *
   * Same lead the email uses, so what lands in the inbox and what appears on
   * Home happen on the same morning — and since 2026-09-02 that is a different
   * number for the two kinds, because a meeting day counts itself and the end
   * of a month does not (`PRE_MEETING_LEAD_DAYS` vs `SEASON_CHECK_IN_LEAD_DAYS`).
   * The pre-meeting one goes when the meeting does; the end-of-month one
   * lingers a week, because the month ending is not the same as everyone
   * having answered.
   */
  /**
   * THE FORM IS ALWAYS OPEN. HOME IS NOT.
   *
   * Nat, 2026-09-04: *"the check ins should always be open, I think. So that if
   * someone has a thought, they can always just pop in and update stuff, you
   * know? But I'll REMIND them of it 3 days before the end of the month & the
   * week of the meetings."*
   *
   * That splits two things this file had treated as one. A due date used to say
   * both "this is worth your attention now" and "this is the only time you may
   * answer" — and the second was never something anybody asked for. Somebody
   * who thinks of a shout-out on the 8th should be able to put it somewhere.
   *
   * So the date is only about the REMINDER. The two merged check-ins — the
   * ones with no `community_id`, which every member shares — remain reachable
   * from Meetings all month. Home shows them only in their nudge window.
   *
   * A HIVE's OWN check-in keeps its window until the October cutover retires
   * it, because a per-HIVE row on Home is exactly the clutter the merge is
   * removing — Nat, 2026-08-15: *"a check-in that sits in your to-do for a
   * fortnight before it means anything teaches you to ignore your to-do."*
   */
  const belongsToNoHive = (survey as { community_id?: string | null }).community_id == null;
  const ownKind = isPreMeetingCheckInSurvey(survey)
    ? 'premeeting'
    : isEndOfMonthCheckInSurvey(survey)
      ? 'endofmonth'
      : null;
  // The shared pre-meeting survey has one due date but many HIVE meeting dates,
  // so this helper cannot decide its Home window. A HIVE Home caller supplies
  // its own next-meeting date. Everywhere else keeps it off the to-do list.
  if (ownKind === 'premeeting' && belongsToNoHive) return false;
  if (ownKind) {
    if (!survey.due_date) return true;
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(survey.due_date);
    if (!dateParts) return true;
    // A database date is a calendar day, not midnight UTC. Constructing it
    // locally avoids shifting September 30 to September 29 in Pacific time.
    const dueDay = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), 12);
    const opens = new Date(
      dueDay.getFullYear(),
      dueDay.getMonth(),
      // A meeting counts its own day. "Three days before month end" means
      // the third-to-last calendar day: due date minus two.
      dueDay.getDate() - (ownKind === 'premeeting' ? PRE_MEETING_LEAD_DAYS : SEASON_CHECK_IN_LEAD_DAYS - 1),
    );
    const lingersUntil = new Date(
      dueDay.getFullYear(),
      dueDay.getMonth(),
      dueDay.getDate() + (ownKind === 'endofmonth' ? 7 : 0),
    );
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return startOfToday >= opens && startOfToday <= lingersUntil;
  }

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

/* ------------------------------------------------------------------------- *
 * Production HIVE's two recurring check-ins.
 *
 * Nat, 2026-08-14, after answering the first one: *"you did the pre-meeting
 * survey, but we still need an end-of-the-month survey — and we always want a
 * pre-meeting survey. The survey that you made was 'before the first meeting',
 * but we always need, like, a check-in before the meeting, like we have for
 * the other HIVEs."*
 *
 * So the first meeting keeps its own warm title and every meeting after it
 * settles into a stable one. Both titles count as Production's pre-meeting
 * check-in; `PRE_MEETING_TITLE_PATTERN` is what recognises them, and
 * `isPreMeetingCheckInSurvey()` reads it.
 *
 * **Production's end-of-month asks about the show, never about the person.**
 * OG's end-of-month gathers shout-outs for the newsletter and Tech's asks what
 * you learned — both right for a room of people each doing their own thing.
 * Production has one shared goal, so "what are YOU working on" is the wrong
 * question for it (Lucas to Nat, 2026-08-13). It asks what moved, what is
 * stuck, and what comes next.
 * ------------------------------------------------------------------------- */

export type EndOfMonthCheckIn = {
  title: string;
  description: string;
  questions: SurveyQuestion[];
};

/**
 * Every answer id whose text is material for the newsletter.
 *
 * Nat, pointing at Admin's Newsletter box, 2026-08-27: *"the compliment, the
 * shout-out, the plug — all of those should go in the HIVE-wide newsletter …
 * that's where all of these populate as well, and then I use those to write
 * the newsletter."* That box reads `survey_responses` for exactly these ids
 * and prints each one under the member's name and their HIVE, so an id on this
 * list is a question with a destination and an id off it is busy work.
 *
 * Named here, in the file that writes the check-ins, so a new HIVE's newsletter
 * question is registered in the same breath as it is asked.
 */
export const NEWSLETTER_ANSWER_IDS = ['q_eom_newsletter', 'q_newsletter', 'q_shoutout'] as const;

/**
 * The one newsletter question, worded the way OG's halfway step asks it.
 *
 * OG's wizard offers pills — shout-out, plug an event, a reminder, compliment
 * someone — and a HIVE whose halfway is a survey rather than a wizard has one
 * box, so the box names all five out loud instead. `q_newsletter` is the id
 * OG's own step writes, which is what carries the answer to Nat's Newsletter
 * box with the member's name and their HIVE on it.
 */
const NEWSLETTER_QUESTION: SurveyQuestion = {
  id: 'q_newsletter',
  text: 'Anything for the newsletter? A shout-out, a plug, an event to come to, a reminder, or a compliment for someone — name names, they get read out. The newsletter goes out on the 1st.',
  type: 'long',
  required: false,
};

/**
 * The end of the month is a nudge, not a report.
 *
 * Nat, 2026-08-15, correcting where the POP belongs: *"end of the month is a
 * halfway check-in and getting stuff ready for the newsletter, just in case
 * there's anything. No obligations."*
 *
 * **Rebuilt 2026-08-27 to OG's shape.** The three questions that stood here —
 * "What moved this month", "What is stuck", "What has to happen before the next
 * meeting" — were three blank prose boxes and nothing else, which is both more
 * work than OG's and less use: *"coarse shit and unusable."* Her rule the same
 * morning, and it is the reason every question below names where its answer
 * goes: *"If you're going to make someone answer a question, you better damn
 * well know what you're going to do with the answer. Having people fill out
 * surveys and then not having their answers go anywhere is just having them do
 * busy work, and it's bad."*
 *
 * So this mirrors OG's `Monthly Check-in: POP + Energy` — arrival, energy, the
 * POP, the HIVE Help recap, the newsletter ask — with Production's subject
 * matter (the show, the venues, the deck) in place of OG's. Every id is one
 * something already reads:
 *
 * - `q_feeling_today`, `q_energy_level`, `q_energy_mode` — the Arrival Board
 *   and OG's own deck.
 * - `q_show_progress`, `q_show_obstacles` — Production's meeting deck reads
 *   both onto its slides by name (`checkInSays` in meeting-helper.tsx), and
 *   the progress box arrives pre-filled with what this member already ticked
 *   off, so nobody is asked to remember what the app knows.
 * - `q_pop_priorities` — the POP export in Admin and the deck's POP sections.
 * - `q_hive_help_recap` — the `focus` field: did it, plus a 1-5 score the deck
 *   can average.
 * - `q_newsletter` — Nat's Newsletter box in Admin, attributed to the member
 *   and their HIVE.
 *
 * Their open to-dos ride ON this survey rather than in it: the carry-forward
 * roster (`lib/hooks/useCarryForwardContext.ts`) draws them above the
 * questions to be ticked off, archived, or kept.
 */
const END_OF_MONTH_BY_SLUG: Record<string, EndOfMonthCheckIn> = {
  /**
   * Production HIVE's halfway check-in — **OG's, copied.**
   *
   * This row used to hold eight questions: arrival, energy, energy mode, three
   * blank prose boxes, the HIVE Help score and the newsletter ask. Nat opened
   * it on 2026-08-27 and knew in one glance: *"this looks like the three days
   * before the meeting, and there's no HIVE Help. This is all bad."* She was
   * right — it had been built from OG's PRE-MEETING check-in (POP + Energy),
   * which is a different survey from OG's halfway one, and the halfway is the
   * one she loves. Her instruction: *"The OG HIVE halfway check-in is perfect.
   * Can you just do that for Production HIVE? Why can't you just copy the same
   * thing? Why is it different?"*
   *
   * **The halfway is a nudge, not an interview.** In her words: *"A lot of
   * people have a lot of things going on in their life. If we meet every four
   * weeks, two weeks in it's like 'hey, don't forget about me.' That way it's
   * not the day before the meeting and you're like, fuck, I didn't go visit any
   * of those places."*
   *
   * So the DOOR is OG's wizard — Newsletter → To-dos → HIVE Help, three steps,
   * about two minutes (`MIDPOINT_STEPS` in monthly-tuneup.tsx, reached through
   * `HALFWAY_BY_SLUG.show`). This row is no longer an interview standing in
   * front of that wizard; it is the FILING CABINET behind it, and it holds the
   * one answer the wizard has nowhere else to put: the newsletter ask, which
   * Admin's Newsletter box reads under the member's name and HIVE.
   *
   * The other two steps already file themselves — to-dos are ticked on the
   * member's own list, and HIVE Help posts to the Helpers board — which is why
   * one question is the whole of it. Every question here still names where its
   * answer goes, which is Nat's rule from the same morning: *"If you're going
   * to make someone answer a question, you better damn well know what you're
   * going to do with the answer."*
   *
   * The arrival, energy and POP questions are not lost — they are what a
   * PRE-MEETING check-in is for, and Production's is designed separately,
   * closer to its meeting (Nat, 2026-08-28: *"Pro HIVE's pre-meeting survey
   * will be unique, so we'll talk about that closer to the meeting"*).
   *
   * The TITLE is load-bearing — `END_OF_MONTH_CHECK_IN_PATTERN` in
   * `_shared/checkInPatterns.ts` is how the cron, Home and Meetings all
   * recognise this check-in, and it already matches "Halfway check-in" — and
   * the DESCRIPTION must stay clear of the words "monthly check-in", which
   * would route it into OG's PRE-MEETING wizard instead of the halfway one.
   */
  show: {
    title: 'End of the month',
    description:
      'The newsletter goes out on the 1st. Two minutes: anything for the letter, tick off what you have done, and say if you want a hand.',
    questions: [
      { ...NEWSLETTER_QUESTION },
    ],
  },
};

export function hasEndOfMonthCheckIn(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return !!END_OF_MONTH_BY_SLUG[community?.slug ?? ''];
}

export function getEndOfMonthCheckIn(
  community: Pick<Community, 'slug'> | null | undefined,
): EndOfMonthCheckIn | null {
  return END_OF_MONTH_BY_SLUG[community?.slug ?? ''] ?? null;
}

/**
 * Whether a survey row is an end-of-month check-in, going by title.
 *
 * Reads `END_OF_MONTH_TITLE_PATTERN`, not the deck titles above — see the note
 * on that pattern for the duplicate this caused while it was a list. Retired
 * names still answer, which is the point: "Halfway check-in" IS this check-in,
 * and a rule about the end-of-month row has to apply to a row called that.
 *
 * `community` is accepted and ignored, exactly as it is for the pre-meeting
 * one, and for the same reason.
 */
export function isEndOfMonthCheckInSurvey(
  survey: { title?: string | null } | null | undefined,
  _community?: Pick<Community, 'slug'> | null,
): boolean {
  return END_OF_MONTH_TITLE_PATTERN.test((survey?.title ?? '').trim());
}

/* ------------------------------------------------------- what to CALL one */

/**
 * THE NAME A MEMBER READS. Never `survey.title` straight off the row.
 *
 * Nat, 2026-09-04: *"make sure that we don't have any lingering, stale names,
 * old names, whatever."* Three live survey rows still carry retired names —
 * OG's says "Monthly Check-in: POP + Energy", Tech's says "Before our first
 * meeting", Production's says "Halfway check-in" — and every screen that
 * printed `survey.title` printed those.
 *
 * **Renaming the rows is not the fix, and it is worth writing down why.** In
 * this app a survey's TITLE IS ITS TYPE: seven separate matchers decide what a
 * check-in *is* by pattern-matching that string — `MONTHLY_CHECK_IN_PATTERN`,
 * `PRE_MEETING_CHECK_IN_PATTERN`, `END_OF_MONTH_CHECK_IN_PATTERN` and the rest,
 * plus an unshared copy of one of them inside `schedule-meeting`. Renaming OG's
 * row to "Before we meet" would not rename a label; it would move OG out of the
 * monthly loop and into the season loop — a different email builder, a
 * different timing rule, and a different dedup namespace, so old receipts stop
 * suppressing a re-send. Two sends, or none, and no error either way.
 *
 * So the row keeps its name as an internal identifier, and this decides what
 * the member is told. One place, so a retired name can only reach a screen
 * through a caller that has not been pointed here.
 *
 * There are exactly TWO names (settled 2026-09-02, never invent a third):
 * **Before we meet** and **End of the month**. The quarterly and the
 * end-of-year keep their own, because they are their own thing.
 */
export function checkInDisplayName(title: string | null | undefined): string {
  const raw = (title ?? '').trim();
  if (!raw) return 'Check-in';
  const t = raw.toLowerCase();

  // The one that belongs to the month, whatever the row happens to be called.
  if (/end of the month|halfway|midpoint|where the show got to/.test(t)) {
    return 'End of the month';
  }
  // The one that rides a meeting. "Before our first meeting" is the same
  // check-in on a HIVE's opening night; the letter still says so in its own
  // sentence, but the NAME is the name.
  if (/before (we meet|our first meeting)|monthly check-?in|tune-?up|pop \+ /.test(t)) {
    return 'Before we meet';
  }
  // Its own thing, and its own name — these are not the monthly pair.
  if (/quarterly/.test(t)) return 'Quarterly check-in';
  if (/end[-\s]of[-\s]year/.test(t)) return 'End of the year check-in';

  // Anything unrecognised is shown as written. A survey Nat makes by hand
  // should say what she typed, not be quietly relabelled.
  return raw;
}

/* ----------------------------------------------------------------------------
 * ONE "BEFORE THE MEETING" CHECK-IN, COVERING EVERY HIVE YOU ARE IN
 * -------------------------------------------------------------------------- */

/**
 * Nat, 2026-09-04: *"We're going to make 2 check ins: end of the month &
 * 'before the meeting'. I want those to show all the hives people are in, so
 * it doesn't matter if you're in 1 hive or 3, you only get 1 survey at the end
 * of the month & 1 survey the week of meetings & you can look through all of
 * the to do lists & stuff, and update everything."*
 *
 * Two check-ins for everybody, full stop. "End of the month" already belongs
 * to no HIVE (migration 225). This is the other half: one pre-meeting check-in
 * that covers all three, so the five members who are in more than one HIVE
 * stop getting three of everything.
 *
 * ## What the merge actually is
 *
 * It is a REGROUPING, not a rewrite. Every HIVE's pre-meeting questions stay
 * exactly as they are — Production still asks about venues seen and what is
 * stuck, OG still asks its POP — because those questions are about that HIVE
 * and only that HIVE. What changes is that the handful of questions about the
 * PERSON get asked once, at the top, instead of three times.
 *
 * So the shape is two tiers:
 *
 *   ABOUT YOU, ASKED ONCE   how you are arriving, your energy, what you want
 *                           from HIVE this month. The same answer would have
 *                           been typed into all three.
 *   ABOUT EACH HIVE         one short section per HIVE you belong to, holding
 *                           that HIVE's own existing questions — plus its
 *                           to-dos, which ride on the survey rather than in it
 *                           (see `useCarryForwardContext`).
 *
 * Somebody in one HIVE barely notices; somebody in three walks three short
 * sections instead of three whole surveys.
 *
 * ## How the answers are stored, and why nothing downstream had to change
 *
 * ONE `survey_responses` ROW PER HIVE, each carrying that HIVE's answers AND a
 * copy of the personal ones. `survey_responses.community_id` has existed since
 * the beginning and the Arrival Board, the Meeting Helper deck and
 * `seal-meeting` all already read answers filtered by it — so each HIVE's night
 * reads its own row and sees a complete picture, exactly as it does today.
 * Migration 228 widened the uniqueness rule to allow it.
 *
 * Copying the personal answers into each row rather than storing them once is
 * deliberate. A HIVE's deck asks one question — "what did the people in MY room
 * say?" — and it must never have to go and find a fourth row belonging to no
 * HIVE to answer it.
 */

/**
 * The questions that are about the PERSON, not about a HIVE.
 *
 * Asked once at the top and copied into every HIVE's row. Kept as ids rather
 * than a second list of question objects, so a HIVE that words its own arrival
 * question differently still lifts the right one out.
 */
export const PERSONAL_CHECK_IN_QUESTION_IDS: string[] = [
  'q_feeling_today',
  PRE_MEETING_QUESTION_IDS.energyLevel,
  'q_energy_mode',
];

/** The name, settled 2026-09-02 and 2026-09-04. Never invent a third. */
export const MERGED_PRE_MEETING_TITLE = 'Before we meet';

export type MergedCheckInSection = {
  communityId: string;
  slug: string;
  /** What to call this section on its own header. */
  name: string;
  questions: SurveyQuestion[];
  /**
   * Set when this section is here because of the DATE rather than because of
   * the HIVE — the quarter, the year. It is what tells a screen that the
   * section will not be there next month, and it is `undefined` for the
   * per-HIVE sections that are always there.
   */
  seasonKind?: SeasonKind;
};

/** The old name, kept so nothing that imports it has to change at once. */
export type MergedPreMeetingSection = MergedCheckInSection;

export type MergedCheckIn = {
  title: string;
  description: string;
  /** Asked once, at the top. */
  personal: SurveyQuestion[];
  /** One per HIVE, or per HIVE per open season, in the order they were given. */
  sections: MergedCheckInSection[];
};

/** The old name, kept so nothing that imports it has to change at once. */
export type MergedPreMeeting = MergedCheckIn;

/** The name, settled 2026-09-02. Never invent a third. */
export const MERGED_END_OF_MONTH_TITLE = 'End of the month';

/**
 * WHERE EACH HIVE'S QUESTIONS COME FROM — the caller, not a table in here.
 *
 * Found by testing the first version of this against all three HIVEs: OG came
 * back with zero questions and Tech came back with its FIRST-NIGHT onboarding
 * deck ("What a HIVE is for", "Which evening suits you best", the Honey Pot
 * vote). Neither is a bug in the merge; both are facts about where a HIVE's
 * pre-meeting questions actually live.
 *
 *   - **Production's** live in this file (`PRE_MEETING_RECURRING_BY_SLUG`).
 *   - **OG's** live in its survey ROW in the database and nowhere else — its
 *     door is the wizard in `monthly-tuneup.tsx`, and the row behind it holds
 *     the real question list.
 *   - **Tech's** code deck is the first-meeting one, which is the wrong list
 *     for every meeting after the first.
 *
 * So this takes the questions as input. The caller reads each HIVE's live
 * active pre-meeting survey and hands the list over, which makes the database
 * the source of truth it already is, and means a question Nat edits in the
 * survey editor shows up here without a deploy.
 */
export function buildMergedPreMeeting(
  hives: {
    id: string;
    slug?: string | null;
    name?: string | null;
    questions: SurveyQuestion[];
  }[],
): MergedPreMeeting {
  const personalById = new Map<string, SurveyQuestion>();
  const sections: MergedPreMeetingSection[] = [];

  for (const hive of hives) {
    const mine: SurveyQuestion[] = [];
    for (const question of hive.questions ?? []) {
      if (question.type === 'note') continue; // a HIVE's own section headers
      // Even arrival and energy can differ next week in another HIVE.
      // Keep every answer in the HIVE section; never copy another room's answer.
      mine.push(question);
    }

    // A HIVE whose whole check-in was personal questions has nothing left to
    // ask about itself, and an empty section header is furniture.
    if (mine.length === 0) continue;

    sections.push({
      communityId: hive.id,
      slug: (hive.slug ?? '').trim().toLowerCase(),
      name: hiveDisplayName(hive.name),
      questions: mine,
    });
  }

  // In the order PERSONAL_CHECK_IN_QUESTION_IDS names them, not the order the
  // first HIVE happened to list them, so the top of the check-in reads the same
  // for everybody however many HIVEs they are in.
  const personal = PERSONAL_CHECK_IN_QUESTION_IDS
    .map((id) => personalById.get(id))
    .filter((question): question is SurveyQuestion => !!question);

  return {
    title: MERGED_PRE_MEETING_TITLE,
    description: sections.length > 1
      ? 'Choose a HIVE and answer for that meeting. Each HIVE keeps its own answers.'
      : 'A few minutes before we meet, so the room starts loaded.',
    personal,
    sections,
  };
}

/**
 * THE KEY AN IN-PROGRESS ANSWER IS HELD UNDER, WHILE THE FORM IS OPEN.
 *
 * Two HIVEs ask `q_attendance`. Both mean it, both need their own answer, and
 * in three separate surveys that was never a problem. In ONE form it is: a
 * draft keyed by bare question id would let Production's "will we see you"
 * overwrite Tech's, and the second HIVE's section would silently mirror the
 * first. Caught by running the builder across all three HIVEs before any of
 * this was wired to a screen.
 *
 * So a question about a HIVE is held under `<community id>:<question id>` while
 * the form is open, and written back under its BARE id into that HIVE's own
 * response row — where `community_id` is what tells the two apart, and where
 * every existing reader already expects the plain name.
 *
 * Personal answers keep their bare id: there is one of each, and they are
 * copied into every row.
 */
export function mergedAnswerKey(communityId: string | null, questionId: string): string {
  return communityId ? `${communityId}:${questionId}` : questionId;
}

/** Split a key back into the HIVE it belongs to and the id to store it under. */
export function readMergedAnswerKey(key: string): { communityId: string | null; questionId: string } {
  const at = key.indexOf(':');
  if (at === -1) return { communityId: null, questionId: key };
  return { communityId: key.slice(0, at), questionId: key.slice(at + 1) };
}

/**
 * Every question the merged check-in asks this person, in the order it asks
 * them, each carrying the key its answer is held under.
 *
 * The section headers are `note` questions, which the wizard already knows how
 * to draw and never stores an answer for.
 */
/* ----------------------------------------------------------------------------
 * A SECTION THAT COMES AND GOES — the season, folded into End of the month
 * -------------------------------------------------------------------------- */

/**
 * Nat, 2026-09-04: *"next month, the only 'end of the month' survey avail will
 * also have 'end of the quarter' questions...so it'll be slightly different &
 * then go back to normal. How do we manage that?"*
 *
 * This is the answer, and it is the same answer as the merge itself. A check-in
 * is not a fixed list of questions; it is a list of SECTIONS, assembled for the
 * person opening it. Some sections are always there (the questions about you),
 * some are there because of who you are (one per HIVE you are in), and some are
 * there because of WHEN it is — the quarter, the year, a HIVE's first night.
 * A seasonal section appears inside its window and falls away after, and
 * nothing has to be launched, retired, or remembered.
 *
 * ## Why the season is per HIVE and not one block
 *
 * Because the three HIVEs ask different questions and reuse the same ids. OG
 * opens its quarter with `q_quarter_story`, Tech with `q_quarter_shipped`,
 * Production with `q_quarter_stage` — and all three then share
 * `q_quarter_proud`, `q_quarter_next`, `q_quarter_hive` and six more. Folded
 * into one flat answer, a member of three HIVEs would have their OG answer
 * overwritten by their Tech one, silently, and only the last would survive.
 *
 * So a season rides the machinery the pre-meeting merge already has: one
 * section per HIVE, one `survey_responses` row per HIVE, each answer under its
 * bare id inside its own row. Every reader that filters by `community_id` — the
 * deck, the Arrival Board, `seal-meeting` — keeps working with no change.
 *
 * ## What this replaces
 *
 * Six survey rows, six launch buttons in Admin, and a whole second email path.
 * A season used to be a survey somebody had to launch per HIVE per occurrence.
 */
export function openSeasonSections(
  hives: { id: string; slug?: string | null; name?: string | null }[],
  today: Date,
): MergedCheckInSection[] {
  const sections: MergedCheckInSection[] = [];
  for (const kind of ['quarter', 'year'] as SeasonKind[]) {
    const occurrence = getUpcomingSeasonOccurrence(kind, today);
    // The same window the season check-in has always had: it opens three days
    // before the season ends and closes with it. Not a day of it is invented
    // here — `getUpcomingSeasonOccurrence` is the one calendar.
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (startOfToday < occurrence.opensDate || startOfToday > occurrence.endDate) continue;

    for (const hive of hives) {
      const deck = buildSeasonCheckIn({ slug: hive.slug ?? '' }, kind, today);
      if (!deck || !deck.questions.length) continue;
      sections.push({
        communityId: hive.id,
        slug: (hive.slug ?? '').trim().toLowerCase(),
        // The section header says which HIVE AND which season, because in the
        // three days a quarter is open a member of two HIVEs is looking at four
        // sections and needs to know which is which.
        name: `${hiveDisplayName(hive.name)} · ${deck.occurrence.label}`,
        questions: deck.questions,
        seasonKind: kind,
      });
    }
  }
  return sections;
}

/**
 * The End of the month, assembled for whoever opened it.
 *
 * The row's own questions are the ones about the person and the month, asked
 * once at the top — they are the same question for everybody, which is why the
 * check-in was merged in the first place. Anything below them is a season, and
 * on 361 days of the year there is nothing below them at all and this returns
 * exactly the check-in that is there today.
 */
export function buildMergedEndOfMonth(
  baseQuestions: SurveyQuestion[],
  hives: { id: string; slug?: string | null; name?: string | null }[],
  today: Date,
): MergedCheckIn {
  const sections = openSeasonSections(hives, today);
  return {
    title: MERGED_END_OF_MONTH_TITLE,
    description: sections.length
      ? 'A few minutes, whichever HIVEs you are in. The first few are about your month; then the season, one section each.'
      : 'A few minutes, whichever HIVEs you are in. What you want in the Buzz, and how the month went.',
    personal: baseQuestions.filter((question) => question.type !== 'note'),
    sections,
  };
}

export function mergedPreMeetingQuestions(
  merged: MergedCheckIn,
): { question: SurveyQuestion; key: string; communityId: string | null }[] {
  const out = merged.personal.map((question) => ({
    question,
    key: question.id,
    communityId: null as string | null,
  }));

  for (const section of merged.sections) {
    // A commitments-only HIVE still needs its section for saving, but has no
    // questions to introduce after the to-do list.
    if (section.questions.length === 0) continue;
    // A section that is here because of the DATE says so — otherwise a member
    // opening End of the month in the last three days of a quarter meets nine
    // extra questions with nothing telling them why, or that they will be gone
    // next month.
    const key = section.seasonKind
      ? `note_${section.seasonKind}_${section.slug}`
      : `note_hive_${section.slug}`;
    out.push({
      question: note(key, section.name, [
        section.seasonKind === 'quarter'
          ? 'Just this HIVE. These come round once a quarter, then they are gone again.'
          : section.seasonKind === 'year'
            ? 'Just this HIVE. Once a year, then they are gone again.'
            : 'Just this HIVE, for the next few.',
      ]),
      key,
      communityId: section.communityId,
    });
    for (const question of section.questions) {
      out.push({
        question,
        key: mergedAnswerKey(section.communityId, question.id),
        communityId: section.communityId,
      });
    }
  }
  return out;
}

/**
 * Split a finished form into the rows that get written — one per HIVE.
 *
 * Each row carries that HIVE's own answers under their bare ids PLUS a copy of
 * every personal answer, so a HIVE's deck reads one row and sees the whole
 * person. See the note on storage above for why the copy is deliberate.
 */
export function splitMergedAnswers(
  merged: MergedCheckIn,
  answers: Record<string, unknown>,
  /**
   * Which answers are copied into every HIVE's row.
   *
   * The pre-meeting one copies arrival, energy and energy-mode, because a
   * HIVE's deck asks "what did the people in MY room say" and must never have
   * to go and find a fourth row to answer it.
   *
   * End of the month passes an EMPTY list. Its questions about the month go in
   * the one HIVE-Wide row where the Buzz reads them, and copying a newsletter
   * shout-out into three HIVEs' rows would have Admin's Newsletter box show it
   * three times.
   */
  personalIds: string[] = PERSONAL_CHECK_IN_QUESTION_IDS,
): { communityId: string; answers: Record<string, unknown> }[] {
  const personal: Record<string, unknown> = {};
  for (const id of personalIds) {
    if (answers[id] !== undefined) personal[id] = answers[id];
  }

  return merged.sections.map((section) => {
    const mine: Record<string, unknown> = { ...personal };
    for (const question of section.questions) {
      const value = answers[mergedAnswerKey(section.communityId, question.id)];
      if (value !== undefined) mine[question.id] = value;
    }
    return { communityId: section.communityId, answers: mine };
  });
}

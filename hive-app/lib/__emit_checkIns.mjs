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
export const CHECK_INS_COMING_SOON_MESSAGE = "Coming soon — the monthly tune-up will be designed around this HIVE’s own rhythm.";
/**
 * OG HIVE keeps the original database slug from before multi-HIVE existed.
 * Tech HIVE joined the list on 2026-08-11, when Nat designed its own rhythm
 * out loud: monthly on a Thursday evening, POP-centred check-ins, networking
 * instead of hangs, and the treasurer slide kept deliberately as the place to
 * talk about WHETHER Tech wants dues at all. Production still waits for its
 * own monthly design.
 *
 * The days, confirmed by Nat 2026-08-27: **Tech meets the FIRST Thursday,
 * 5-7pm, on Google Meet**, and it is a recurring series on her calendar.
 * **Production takes the SECOND Thursday, 5-7pm, in person** — deliberately
 * not recurring, because each month's date is set during the meeting before
 * it. OG lands mid-to-late month and its date moves the same way, meeting to
 * meeting. No day of the week is hardcoded anywhere in this file; everything
 * below reads the real meeting date.
 */
export function hasTailoredCheckIns(community) {
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
export function hasHalfwayTuneup(community) {
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
export function hasMeetingDeck(community) {
    return (community?.slug === 'default'
        || community?.slug === 'tech'
        || community?.slug === 'show');
}
const HALFWAY_BY_SLUG = {
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
export function getHalfwayShape(community) {
    return HALFWAY_BY_SLUG[community?.slug ?? ''] ?? null;
}
/**
 * Whether today sits in that HIVE's halfway nudge window.
 *
 * `nextMeetingDate` is only consulted for the `cycle` shape, and a HIVE with
 * no meeting on the books simply doesn't get nudged — better silent than
 * nudging about a halfway point to nothing.
 */
export function isInHalfwayWindow(shape, today, nextMeetingDate) {
    if (shape.window === 'month') {
        const daysLeftInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
        return daysLeftInMonth <= 4;
    }
    if (!nextMeetingDate)
        return false;
    const [year, month, day] = nextMeetingDate.split('-').map(Number);
    if (!year || !month || !day)
        return false;
    const meeting = new Date(year, month - 1, day);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysUntilMeeting = Math.round((meeting.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
    // Days 16 through 12 before the meeting — five days sitting squarely in the
    // middle of a monthly cycle, the same five-day length OG's window has.
    return daysUntilMeeting <= 16 && daysUntilMeeting >= 12;
}
/** Days before the quarter/year end that the check-in opens and the cron nudges. */
export const SEASON_CHECK_IN_LEAD_DAYS = 3;
/**
 * How the two season check-ins are recognised, wherever they travel.
 *
 * This used to be a second copy of the regexes in the email function, with
 * "change one, change both" written on both of them. There is one copy now, in
 * `supabase/functions/_shared/checkInPatterns.ts` — a folder every edge
 * function deploy uploads, and one the app reaches perfectly well from here.
 * Re-exported so nothing that already imports them from this file has to move.
 */
export { QUARTERLY_CHECK_IN_PATTERN, END_OF_YEAR_CHECK_IN_PATTERN, } from '../supabase/functions/_shared/checkInPatterns.ts';
import { QUARTERLY_CHECK_IN_PATTERN, END_OF_YEAR_CHECK_IN_PATTERN, } from '../supabase/functions/_shared/checkInPatterns.ts';
/** One mark per rhythm on Home: the monthly wears 📋, these wear their own. */
export const SEASON_CHECK_IN_EMOJI = {
    quarter: '🧭',
    year: '🎉',
};
/** Which season check-in a survey is, going only by its title — the same way
 *  the monthly check-in has always been recognised. */
export function getSeasonCheckInKind(survey) {
    const title = survey?.title ?? '';
    if (END_OF_YEAR_CHECK_IN_PATTERN.test(title))
        return 'year';
    if (QUARTERLY_CHECK_IN_PATTERN.test(title))
        return 'quarter';
    return null;
}
function lastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0);
}
/**
 * The next quarterly occurrence on or after `today`. Q4 is deliberately not
 * one — see the block comment above: December belongs to the end-of-year
 * check-in, so from October onward the next quarterly is Q1 of the new year.
 */
export function getUpcomingQuarterOccurrence(today) {
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
export function getUpcomingYearOccurrence(today) {
    const year = today.getFullYear();
    const endDate = new Date(year, 11, 31);
    return {
        kind: 'year',
        label: `${year}`,
        endDate,
        opensDate: new Date(year, 11, 31 - SEASON_CHECK_IN_LEAD_DAYS),
    };
}
export function getUpcomingSeasonOccurrence(kind, today) {
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
const QUARTER_DESCRIPTION = 'Three months went by — take five quiet minutes to look back before the next ones start. Short answers are perfect.';
const YEAR_DESCRIPTION = 'The year is wrapping up. Look back with us, celebrate a little, and point at what comes next. Short answers are perfect.';
const q = (id, text, type = 'long') => ({ id, text, type, required: false });
const QUARTER_QUESTIONS_BY_SLUG = {
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
const YEAR_QUESTIONS_BY_SLUG = {
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
export function hasSeasonCheckIns(community) {
    const slug = community?.slug ?? '';
    return slug in QUARTER_QUESTIONS_BY_SLUG && slug in YEAR_QUESTIONS_BY_SLUG;
}
export function buildSeasonCheckIn(community, kind, today) {
    const slug = community?.slug ?? '';
    const questions = (kind === 'quarter' ? QUARTER_QUESTIONS_BY_SLUG : YEAR_QUESTIONS_BY_SLUG)[slug];
    if (!questions)
        return null;
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
        dueDateIso: new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1)).toISOString(),
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
};
const choice = (id, text, options) => ({
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
export const PERSONAL_HARD_OUT_QUESTION = {
    id: PRE_MEETING_QUESTION_IDS.hardOut,
    text: 'Do you have a hard out? If so, what time?',
    type: 'short',
    required: false,
};
const PRE_MEETING_BY_SLUG = {
    // Production HIVE keeps the database slug `show`. This is the RECURRING
    // check-in — the first meeting's one-time questions (cadence, Honey Pot,
    // who-can-know, walk-away lines) were asked and answered on 2026-08-18; the
    // full set and its reasoning live in the brain folder's receipts and on the
    // answered survey row. From here on, Nat's shape (2026-08-19): "did you get
    // it done, is it on the board, any pictures to upload." The question ids
    // are load-bearing — the meeting deck reads q_show_progress,
    // q_biggest_question, q_show_obstacles and q_plate back onto its slides.
    show: {
        title: 'Before we meet',
        description: 'Production HIVE meets soon. A few minutes here means the meeting starts loaded with what everyone found. Short answers are perfect.',
        questions: [
            choice('q_attendance', 'Will we see you at this one?', [
                "🐝 I'll be there in person",
                '💻 Joining remotely',
                '😢 Missing this one — please email me the recap',
            ]),
            { ...PERSONAL_HARD_OUT_QUESTION },
            q('q_show_progress', 'Your jobs from last meeting — what got done? Venues seen, calls made, numbers learned.'),
            q('q_on_board', "Is what you found on the board yet? If it's still in your notes, paste the one thing worth posting."),
            q('q_pictures', 'Any pictures, quotes or files to bring? Put them on the Pre-Production board, or say here what you have.'),
            q('q_show_obstacles', 'What is stuck, or waiting on somebody?'),
            choice('q_plate', 'How much is on your plate right now?', [
                '🍽️ Plenty of room — hand me something',
                "🥄 A bit on there, and I've got room for this",
                "🍲 Pretty full — I'll take one small thing",
                '🫙 Full to the brim — I want to listen this time',
            ]),
            q('q_biggest_question', "Your biggest question right now — ask it here and we'll answer it in the room."),
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
     * Where each one lands, which is the only reason each one is here:
     *
     * | question | where it shows up |
     * |---|---|
     * | q_attendance | the Arrival Board, and the sealed summary |
     * | q_building | your 30-second intro bubble on the HummDinger |
     * | q_pop_progress / _obstacles / _priorities | your HummDinger sheet, under the HD legend the slide already prints |
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
     * back as a percentage instead of prose), `q_want` + `q_stuck` +
     * `q_biggest_question` (they are the POP block now, on the member's own
     * bubble — Nat, 2026-08-31), and `q_learned`, which said its answer could go
     * "straight on the Things We Learned board" while nothing posted it. That
     * one comes back the day it does.
     */
    tech: {
        title: 'Before our first meeting',
        description: 'Thursday September 3rd, 5–7pm, on Google Meet — our first Tech HIVE. What you write here fills your spot in the room: your intro, what you are working on, and how we run this thing. Short answers are perfect, and blanks are completely fine.',
        questions: [
            choice('q_attendance', 'Will we see you Thursday?', [
                "💻 I'll be on the call",
                "🐝 Can't make this one — but I still want to be in the group",
                '🤔 Not sure yet',
            ]),
            // Becomes the intro bubble on the HummDinger slide, word for word, so
            // the first thing the room sees about you is the thing you are making.
            q('q_building', 'What are you building right now? One line is plenty — it becomes your 30-second intro.'),
            // The HummDinger's own legend, in the order the slide prints it:
            // where are you · what have you tried · where are you stuck · what next.
            q('q_pop_progress', 'What have you tried so far?'),
            q('q_pop_obstacles', 'Where are you stuck? This is the bit the room is for.'),
            q('q_pop_priorities', "What are you focused on next, and how could this room help?"),
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
            choice('q_honey_pot', 'Some HIVEs keep a Honey Pot and some do not. OG HIVE’s is $25 a quarter per member, spent however the HIVE decides — hoodies this fall, maybe a Bumblebee Ball to close the year. Want one here?', [
                'Yes — count me in',
                'Maybe — talk me through it',
                'Let’s leave it for now',
            ]),
            choice('q_honey_pot_for', 'If we had one, what should it go toward first?', [
                'Tech HIVE hoodies',
                'A Bumblebee Ball',
                'Tools or subscriptions we all use',
                'I have another idea — I’ll bring it Thursday',
            ]),
            { id: 'q_energy_level', text: 'Energy: what is your energy level right now?', type: 'scale', required: false },
            { ...PERSONAL_HARD_OUT_QUESTION },
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
const PRE_MEETING_RECURRING_BY_SLUG = {
    show: {
        title: PRE_MEETING_RECURRING_TITLE,
        description: 'Three minutes before we meet: where your jobs got to, how you are, and how much you can take on. It is what the meeting runs off.',
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
export function getRecurringPreMeetingCheckIn(community) {
    return PRE_MEETING_RECURRING_BY_SLUG[community?.slug ?? ''] ?? null;
}
/** Whether this HIVE has a pre-meeting deck written for it. */
export function hasPreMeetingCheckIn(community) {
    return (community?.slug ?? '') in PRE_MEETING_BY_SLUG;
}
/** The deck itself — title, description and questions — ready to become a
 *  `surveys` row, or to be read back for its ids. */
export function getPreMeetingCheckIn(community) {
    return PRE_MEETING_BY_SLUG[community?.slug ?? ''] ?? null;
}
/**
 * Every title that counts as this HIVE's pre-meeting check-in.
 *
 * Tech joined the list on 2026-08-27. Its *"Before our first meeting"* survey
 * has been live and working since the 25th — but only because every caller
 * asks this question WITHOUT a community, which falls back to "any HIVE's
 * pre-meeting title counts". The moment one asked about Tech by name the
 * answer would have been no, and Tech's own check-in would have stopped being
 * a check-in. A HIVE that runs the ritual belongs on the list that names it.
 */
export const PRE_MEETING_TITLES_BY_SLUG = {
    show: ['Before our first meeting', 'Before we meet'],
    tech: ['Before our first meeting', 'Before we meet'],
};
/**
 * Whether a survey row is that HIVE's pre-meeting check-in, going by its
 * title — the same way every other check-in is recognised. Pass the community
 * when you have it; without one, any HIVE's pre-meeting title counts.
 */
export function isPreMeetingCheckInSurvey(survey, community) {
    const title = (survey?.title ?? '').trim().toLowerCase();
    if (!title)
        return false;
    const slugs = community ? [community.slug ?? ''] : Object.keys(PRE_MEETING_TITLES_BY_SLUG);
    return slugs.some((slug) => (PRE_MEETING_TITLES_BY_SLUG[slug] ?? []).some((known) => known.toLowerCase() === title));
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
export function isSurveyOnHomeToday(survey, today) {
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
     * Same three-day lead the email uses, so what lands in the inbox and what
     * appears on Home happen on the same morning. The pre-meeting one goes when
     * the meeting does; the end-of-month one lingers a week, because the month
     * ending is not the same as everyone having answered.
     */
    const ownKind = isPreMeetingCheckInSurvey(survey)
        ? 'premeeting'
        : isEndOfMonthCheckInSurvey(survey)
            ? 'endofmonth'
            : null;
    if (ownKind) {
        if (!survey.due_date)
            return true;
        const due = new Date(survey.due_date);
        if (Number.isNaN(due.getTime()))
            return true;
        const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        const opens = new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() - SEASON_CHECK_IN_LEAD_DAYS);
        const lingersUntil = new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() + (ownKind === 'endofmonth' ? 7 : 0));
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return startOfToday >= opens && startOfToday <= lingersUntil;
    }
    if (!getSeasonCheckInKind(survey))
        return true;
    if (!survey.due_date)
        return true;
    const due = new Date(survey.due_date);
    if (Number.isNaN(due.getTime()))
        return true;
    // The stored instant renders as 5pm local on the real end day, so the
    // local calendar date of `due` IS the quarter/year's last day.
    const endDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const opens = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - SEASON_CHECK_IN_LEAD_DAYS);
    const lingersUntil = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 14);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return startOfToday >= opens && startOfToday <= lingersUntil;
}
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
export const NEWSLETTER_ANSWER_IDS = ['q_eom_newsletter', 'q_newsletter', 'q_shoutout'];
/**
 * The one newsletter question, worded the way OG's halfway step asks it.
 *
 * OG's wizard offers pills — shout-out, plug an event, a reminder, compliment
 * someone — and a HIVE whose halfway is a survey rather than a wizard has one
 * box, so the box names all five out loud instead. `q_newsletter` is the id
 * OG's own step writes, which is what carries the answer to Nat's Newsletter
 * box with the member's name and their HIVE on it.
 */
const NEWSLETTER_QUESTION = {
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
const END_OF_MONTH_BY_SLUG = {
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
        title: 'Halfway check-in',
        description: 'Halfway through the month — the newsletter goes out on the 1st. Two minutes: anything for the letter, tick off what you have done, and say if you want a hand.',
        questions: [
            { ...NEWSLETTER_QUESTION },
        ],
    },
};
export function hasEndOfMonthCheckIn(community) {
    return !!END_OF_MONTH_BY_SLUG[community?.slug ?? ''];
}
export function getEndOfMonthCheckIn(community) {
    return END_OF_MONTH_BY_SLUG[community?.slug ?? ''] ?? null;
}
/** Whether a survey row is that HIVE's end-of-month check-in, going by title. */
export function isEndOfMonthCheckInSurvey(survey, community) {
    const title = (survey?.title ?? '').trim().toLowerCase();
    if (!title)
        return false;
    const decks = community
        ? [END_OF_MONTH_BY_SLUG[community.slug ?? '']].filter(Boolean)
        : Object.values(END_OF_MONTH_BY_SLUG);
    return decks.some((deck) => deck.title.toLowerCase() === title);
}

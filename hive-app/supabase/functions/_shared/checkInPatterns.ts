/**
 * How a check-in is recognised, written once.
 *
 * These regexes used to exist twice — in `lib/checkIns.ts` for the app and
 * again at the top of `supabase/functions/check-in-reminder/index.ts` for the
 * email — with a comment on each saying "change one, change both."
 *
 * That comment is not a safeguard, it is a note about a bug that has not
 * happened yet. On 2026-08-15 it happened: Production's end-of-month check-in
 * was renamed "Pro HIVE POP" and two files had to be found and edited to keep
 * one rename working. Nat, the same afternoon: *"the same truth written twice
 * ... that's part of why today's break happened. Okay, let's fix that."*
 *
 * It lives under `_shared/` because that folder is uploaded with every edge
 * function deploy, and the app reaches it perfectly well from `lib/`. Plain
 * regexes, no imports, so both runtimes can read it.
 *
 * **A title is how every check-in is known.** There is no `kind` column; the
 * cron, Home, the Meetings screen and the deck all ask the same question of the
 * same string. Renaming a survey therefore means adding the new title here,
 * and keeping the old one so rows created before the rename still answer to it.
 */

/** OG and Tech's monthly rhythm — "Monthly Check-in: POP + Energy". */
export const MONTHLY_CHECK_IN_PATTERN = /monthly\s+check-?in/i;

/** The quarter, three times a year. December belongs to the year instead. */
export const QUARTERLY_CHECK_IN_PATTERN = /quarterly\s+check-?in/i;

/** The year, once. */
export const END_OF_YEAR_CHECK_IN_PATTERN = /end[-\s]of[-\s]year\s+check-?in/i;

/**
 * A HIVE that checks in before each meeting rather than on the calendar month.
 * Production's is the first (2026-08-14): the first meeting keeps its own warm
 * title, and every meeting after it uses the stable one.
 */
export const PRE_MEETING_CHECK_IN_PATTERN = /before (our first meeting|we meet)/i;

/**
 * The first one a HIVE ever runs.
 *
 * A first-meeting check-in is not the same letter as a monthly one, and it
 * cannot be: "before we meet" assumes we have met. Tech's is onboarding — it
 * fills your intro, seeds your HummDinger and votes on how the HIVE will run —
 * so the email that carries it says that, and says it once. Recognised by
 * title, the way every other check-in is.
 */
export const FIRST_MEETING_CHECK_IN_PATTERN = /before our first meeting/i;

/**
 * Production's end-of-month check-in. It is a "Halfway check-in" as of
 * 2026-08-15 — a gentle nudge and a newsletter ask, after the POP questions
 * moved to the pre-meeting deck where a meeting can actually use them. Both
 * earlier titles stay so rows created before either rename still answer.
 */
export const END_OF_MONTH_CHECK_IN_PATTERN = /(where the show got to this month|pro hive pop|halfway check-?in)/i;

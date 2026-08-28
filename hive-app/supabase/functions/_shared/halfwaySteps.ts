/**
 * What the halfway check-in actually walks you through, per HIVE.
 *
 * THIS IS A DELIBERATE SECOND COPY of `MIDPOINT_STEPS` / `SHOW_MIDPOINT_STEPS`
 * in `hive-app/app/(app)/monthly-tuneup.tsx`. **Change one, change the other.**
 * The two runtimes cannot share a file — the app is TypeScript compiled by
 * Metro, edge functions are Deno — the same reason `_shared/hiveMark.ts` is a
 * second copy of the brand table.
 *
 * It exists because the halfway letter is an invitation to a wizard, and an
 * invitation that lists a step the wizard does not have is a promise the app
 * then breaks. That had already happened twice in one letter: the third bullet
 * offered "update your HD wish", which is a PRE-MEETING step and is not in this
 * flow at all, and then offered HIVE Help to Production. Nat, 2026-08-28: *"Pro
 * HIVE 1/2 way check in is ALMOST beat for beat like OG HIVE, except Pro HIVE
 * does NOT have a HIVE Help."*
 *
 * HIVE Help is OG's ritual — the 15-minute favour swap with its own board and
 * its own monthly focus thread. Production has never run it.
 *
 * A fourth HIVE is a fourth ENTRY here, never a fourth `if`.
 */

/** One bullet in the letter — the same step, said the way an email says it. */
const NEWSLETTER_BULLET =
  'Want a <strong>shout-out, a plug, or a reminder</strong> in the newsletter? Say so and it lands there';
const TODOS_BULLET =
  "Check off anything you've finished on your <strong>to-do list</strong>";
const HIVE_HELP_BULLET =
  'Want a hand with something? Ask for it in <strong>HIVE Help</strong>';

/** OG's three: newsletter, to-dos, HIVE Help. */
const DEFAULT_STEPS = [NEWSLETTER_BULLET, TODOS_BULLET, HIVE_HELP_BULLET];

const HALFWAY_STEPS_BY_SLUG: Record<string, string[]> = {
  default: DEFAULT_STEPS,
  // Production HIVE keeps the database slug `show`. OG's, minus HIVE Help.
  show: [NEWSLETTER_BULLET, TODOS_BULLET],
};

/**
 * The bullets this HIVE's halfway letter should list.
 *
 * Falls back to OG's, which is what every caller before Production wanted — and
 * a HIVE that reaches this letter at all has a halfway shape saying `tuneup`,
 * so the newsletter and to-do steps are the two it is guaranteed to have.
 */
export function halfwayStepsFor(slug?: string | null): string[] {
  return HALFWAY_STEPS_BY_SLUG[(slug ?? '').trim().toLowerCase()] ?? DEFAULT_STEPS;
}

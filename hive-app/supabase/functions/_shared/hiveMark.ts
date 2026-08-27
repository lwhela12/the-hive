/**
 * What a HIVE looks like in an email: its emoji, and its colour.
 *
 * THIS IS A DELIBERATE SECOND COPY of the `HIVE_MARKS` table in
 * `hive-app/lib/hiveBrand.ts`. **Change one, change the other.** The two
 * runtimes cannot share a file — the app is TypeScript compiled by Metro,
 * edge functions are Deno, and the module graph does not really reach outside
 * the functions directory at runtime (tried 2026-08-12; see `letter.ts`).
 *
 * It exists because an email is the one HIVE surface with no `communities`
 * row to read colours off — the HTML is written by hand, and hand-written
 * branding is how one HIVE ends up wearing another's costume. Nat, 2026-08-27,
 * on the Tech HIVE check-in: *"Tech HIVE has the wrong emoji — it has the
 * director's cut board, like for movies. Tech HIVE should have the little
 * robot... Tech HIVE is the wrong colour too — I just opened the survey and
 * it's purple."* The clapperboard and the purple are **Production's**; they
 * had been typed straight into the check-in email back when Production was
 * the only HIVE that email went to, and every other HIVE inherited the
 * costume.
 *
 * A fourth HIVE is a fourth ENTRY here, never a fourth `if`.
 */

export type HiveMark = {
  /** The HIVE's own emoji — its face in a subject line and at the top of the letter. */
  emoji: string;
  /** The HIVE's accent, for the kicker, the heading and the button. */
  accent: string;
};

/** The HIVE default: the honeybee, in honey gold. */
const DEFAULT_MARK: HiveMark = { emoji: '🐝', accent: '#bd9348' };

const HIVE_MARKS: Record<string, HiveMark> = {
  // OG HIVE still carries `default` from before there was more than one HIVE.
  default: DEFAULT_MARK,
  // Tech HIVE — the little robot, and Tech's dark blue.
  tech: { emoji: '🤖', accent: '#2f4a63' },
  // Production HIVE — the clapperboard, and Production's purple. This is the
  // show HIVE; the clapperboard belongs here and nowhere else.
  show: { emoji: '🎬', accent: '#6b4a8f' },
};

/**
 * A HIVE's emoji and colour, by slug.
 *
 * `accentColour` is the row's own `accent_color` when the caller has selected
 * it — the database stays the source of truth for colour, the way it is for
 * every screen in the app. The table is the safety net: a HIVE whose row lost
 * its colour still comes back wearing its own instead of everybody's gold.
 */
export function hiveMark(slug?: string | null, accentColour?: string | null): HiveMark {
  const mark = HIVE_MARKS[(slug ?? '').trim().toLowerCase()] ?? DEFAULT_MARK;
  const raw = (accentColour ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? { emoji: mark.emoji, accent: raw } : mark;
}

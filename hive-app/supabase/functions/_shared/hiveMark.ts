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

/**
 * WHERE A SEAL IS SERVED FROM, AND WHY IT IS A FULL URL.
 *
 * An email is read on somebody else's computer. A relative path resolves
 * against the mail client, which is nowhere, so every image in a letter has to
 * carry the whole address. These live in the app's `public/logos/`, which the
 * web export copies to `dist/` — so they are served by the same deploy that
 * serves the app, and a seal can never be newer or older than the app it
 * belongs to.
 */
const LOGO_BASE = `${Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app'}/logos`;

export type HiveMark = {
  /**
   * The HIVE's own emoji — its face in a subject line, and the letter's
   * fallback when the seal below does not load.
   *
   * **It is not decoration any more, it is the safety net.** Most mail clients
   * refuse remote images until the reader asks for them, so roughly half of
   * every letter arrives with a broken box where the seal is. The emoji is the
   * seal's `alt` text, which is what shows in that box — so the letter still
   * says which HIVE it came from, in one character, before anybody presses
   * "display images".
   */
  emoji: string;
  /** The HIVE's accent, for the kicker, the heading and the button. */
  accent: string;
  /**
   * The HIVE's SEAL — its round badge, in its own colours (Nat, 2026-09-04).
   *
   * The SIMPLIFIED one, without the motto. She drew both; the motto ring
   * ("HUMAN · INSIGHT · VISION · EXECUTION") is set small enough that at the
   * 72px an email header gives it, it renders as a grey smudge. The formal one
   * is for the places that can give it room — see `hiveSeal` in
   * `lib/hiveBrand.ts` for the same split on the app's side.
   */
  logo: string;
  /**
   * The FORMAL seal — the same badge with the motto ring around it, HUMAN ·
   * INSIGHT · VISION · EXECUTION.
   *
   * Only for a letter that can give it 120px or more, which is the Buzz's
   * masthead and nothing else today. Below that the motto is set too small to
   * be words and renders as a grey texture, which is why `logo` above is the
   * simplified one and is what every other letter uses.
   */
  logoFormal: string;
};

/** The HIVE default: the honeybee, in honey gold, under the HIVE-Wide seal. */
const DEFAULT_MARK: HiveMark = {
  emoji: '🐝',
  accent: '#bd9348',
  logo: `${LOGO_BASE}/og-hive.png`,
  logoFormal: `${LOGO_BASE}/og-hive-formal.png`,
};

const HIVE_MARKS: Record<string, HiveMark> = {
  // OG HIVE still carries `default` from before there was more than one HIVE.
  // Its seal is the cream-and-gold one.
  default: DEFAULT_MARK,
  // Tech HIVE — the little robot, Tech's dark blue, and the circuit-board seal.
  tech: {
    emoji: '🤖',
    accent: '#2f4a63',
    logo: `${LOGO_BASE}/tech-hive.png`,
    logoFormal: `${LOGO_BASE}/tech-hive-formal.png`,
  },
  // Production HIVE — the clapperboard, Production's purple, and the seal with
  // the theatre curtains. This is the show HIVE; the clapperboard belongs here
  // and nowhere else.
  show: {
    emoji: '🎬',
    accent: '#6b4a8f',
    logo: `${LOGO_BASE}/production-hive.png`,
    logoFormal: `${LOGO_BASE}/production-hive-formal.png`,
  },
};

/**
 * The mark for mail that belongs to NO single HIVE — the merged End of the
 * month, the Buzz, anything HIVE-Wide. Its seal is the black-and-gold one with
 * the cosmos behind the bee, which is the only one that is not somebody's
 * costume.
 */
export const HIVE_WIDE_MARK: HiveMark = {
  emoji: '🐝',
  accent: '#bd9348',
  logo: `${LOGO_BASE}/hive-wide.png`,
  logoFormal: `${LOGO_BASE}/hive-wide-formal.png`,
};

/**
 * The seal, as an `<img>` ready to drop into a letter.
 *
 * One place, because a letter that builds its own means a letter that can be
 * given the wrong one — the exact way Production's clapperboard ended up on
 * Tech's check-in. `alt` is the HIVE's emoji so a blocked image still says
 * which HIVE this is; `width`/`height` are attributes as well as styles
 * because Outlook ignores the style and would otherwise draw it full size.
 */
export function hiveSealImg(mark: HiveMark, size = 72): string {
  // The motto ring only reads as words at 120px and up, so the size decides
  // which file goes in — a caller can never pick the wrong one by hand.
  const src = size >= 120 ? mark.logoFormal : mark.logo;
  return `<img src="${src}" alt="${mark.emoji}" width="${size}" height="${size}"`
    + ` style="width:${size}px;height:${size}px;display:inline-block;border:0;outline:none;text-decoration:none;" />`;
}

/**
 * A HIVE's emoji and colour, by slug.
 *
 * `accentColour` is the row's own `accent_color` when the caller has selected
 * it — the database stays the source of truth for colour, the way it is for
 * every screen in the app. The table is the safety net: a HIVE whose row lost
 * its colour still comes back wearing its own instead of everybody's gold.
 */
export function hiveMark(slug?: string | null, accentColour?: string | null): HiveMark {
  // No slug at all means no single HIVE — HIVE-Wide mail, which has its own
  // seal rather than borrowing OG's. A slug we do not recognise is a fourth
  // HIVE nobody has dressed yet, and still falls back to the default.
  const key = (slug ?? '').trim().toLowerCase();
  const mark = key ? (HIVE_MARKS[key] ?? DEFAULT_MARK) : HIVE_WIDE_MARK;
  const raw = (accentColour ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? { ...mark, accent: raw } : mark;
}

import type { Community } from '../types';

/** The HIVE default — honey gold. Every hive falls back to this. */
export const HIVE_GOLD = '#bd9348';

/**
 * What to call a hive on screen.
 *
 * The original community row has been called all sorts of things over the
 * months ("The HIVE", "H.I.V.E.", "hive"). Any of those mean the one brand, so
 * they collapse to "HIVE". A hive with a real name of its own — OG HIVE, Tech
 * HIVE — keeps it exactly as typed.
 */
export function hiveDisplayName(name?: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'HIVE';
  if (['hive', 'the hive', 'h.i.v.e.', 'the h.i.v.e.'].includes(trimmed.toLowerCase())) {
    return 'HIVE';
  }
  return trimmed;
}

/**
 * What a HIVE looks like when it has to fit in one character and one colour.
 *
 * Every HIVE already has a colour in the database (`communities.accent_color`),
 * and that stays the source of truth for it — an admin can change it without a
 * deploy. This map is the other half: the EMOJI, which has no column, and a
 * written-down accent so a HIVE whose row lost its colour still comes back
 * wearing its own instead of everybody's gold.
 *
 * Nat, 2026-08-27, looking at Tech HIVE: *"Tech HIVE has the wrong emoji — it
 * has the director's cut board, like for movies. Tech HIVE should have the
 * little robot, it's cute, that's what I use on my Google Calendar. Tech HIVE
 * is the wrong colour too."* The clapperboard and the purple are
 * **Production's** — it is the theatre HIVE — and they had been written into
 * the check-in email by hand back when Production was the only HIVE that email
 * went to. Hand-written branding is how one HIVE ends up wearing another's
 * costume, so it lives here now: a fourth HIVE is a fourth ENTRY, never a
 * fourth `if`.
 */
export type HiveMark = {
  /** The HIVE's own emoji — its face in a subject line, a calendar, a header. */
  emoji: string;
  /** The written-down accent, used only when the database row has none. */
  accent: string;
};

/** The HIVE default: the honeybee, in honey gold. */
const DEFAULT_MARK: HiveMark = { emoji: '🐝', accent: HIVE_GOLD };

const HIVE_MARKS: Record<string, HiveMark> = {
  // OG HIVE still carries `default` from before there was more than one HIVE.
  default: DEFAULT_MARK,
  // Tech HIVE — the little robot, and Tech's dark blue.
  tech: { emoji: '🤖', accent: '#2f4a63' },
  // Production HIVE — the clapperboard, and Production's purple. This is the
  // show HIVE; the clapperboard belongs here and nowhere else.
  show: { emoji: '🎬', accent: '#6b4a8f' },
};

/** A HIVE's emoji and written-down accent, by slug. Anything else is the bee. */
export function hiveMark(slug?: string | null): HiveMark {
  return HIVE_MARKS[(slug ?? '').trim().toLowerCase()] ?? DEFAULT_MARK;
}

/* ------------------------------------------------------------------------- *
 * THE SEALS
 *
 * Nat's round badges, one per HIVE, drawn 2026-09-04 — a bee at the centre of
 * a ring in that HIVE's own colours: OG cream and gold, Tech navy over a
 * circuit board, Production purple behind theatre curtains, and HIVE-Wide
 * black and gold with the cosmos behind it.
 *
 * ## Two versions, and only one of them is in here
 *
 * She drew both and kept both. The FORMAL one carries the motto around its
 * outer ring — HUMAN · INSIGHT · VISION · EXECUTION — and the SIMPLIFIED one
 * does not. That is not a matter of taste, it is a matter of size: the motto is
 * set small enough that below roughly 120px it stops being words and becomes a
 * grey texture.
 *
 * Every seal the APP draws is small — a check-in header, a list row, a chip —
 * so the app only ever uses the simplified one, and this table only loads that.
 * The formal files sit beside them in `public/logos/*-formal.png`, unbundled,
 * for the places that can give them 120px and mean it: the Buzz's masthead
 * (`_shared/hiveMark.ts` addresses those by URL) and anything printed.
 *
 * Loading all eight was the first version of this, and it put four 1MB PNGs
 * into the web bundle that nothing on any screen ever drew.
 *
 * ## Why they are loaded out of `public/`
 *
 * `public/` is copied verbatim into the web export, which is what lets an
 * EMAIL reach them: a letter is read on somebody else's computer, so its
 * images need a full URL, and `_shared/hiveMark.ts` builds those against the
 * app's own domain. Requiring the same files here rather than keeping a second
 * copy under `assets/` means the seal in the app and the seal in the inbox are
 * the same bytes, and cannot drift into being two different logos.
 *
 * A fourth HIVE is a fourth ENTRY, the same as the marks above.
 * -------------------------------------------------------------------------- */

/** The seal for anything belonging to NO single HIVE — the one that is nobody's costume. */
export const HIVE_WIDE_SLUG = 'hive-wide';

const HIVE_SEALS: Record<string, number> = {
  [HIVE_WIDE_SLUG]: require('../public/logos/hive-wide.png'),
  // OG HIVE still carries `default` from before there was more than one HIVE.
  default: require('../public/logos/og-hive.png'),
  tech: require('../public/logos/tech-hive.png'),
  show: require('../public/logos/production-hive.png'),
};

/**
 * A HIVE's seal, ready for `<Image source={…} />`.
 *
 * No slug means no single HIVE, which is the HIVE-Wide seal rather than OG's —
 * the same rule `hiveMark` in `_shared/hiveMark.ts` follows for a letter. A
 * slug nobody has dressed yet lands there too, because a seal that says "HIVE"
 * is honest and one that says "OG HIVE" is a lie.
 */
export function hiveSeal(slug?: string | null): number {
  const key = (slug ?? '').trim().toLowerCase();
  return HIVE_SEALS[key] ?? HIVE_SEALS[HIVE_WIDE_SLUG];
}

/** A HIVE's emoji. Takes the community row, or nothing, and always answers. */
export function hiveEmoji(community?: Pick<Community, 'slug'> | null): string {
  return hiveMark(community?.slug).emoji;
}

/**
 * The colour of this hive's header bar. Null/blank/malformed falls back to the
 * HIVE's own written-down accent, and only then to gold.
 *
 * Takes anything carrying an accent rather than a whole `Community`, because
 * half the callers only ever selected `name, accent_color` from the database —
 * a joined hive on a wish, a row in a list — and asking those for a full
 * community row would mean fetching columns nobody draws. `slug` is optional
 * for the same reason: a caller that has it gets the safety net, and a caller
 * that never selected it is no worse off than before.
 */
export function hiveAccent(
  community?: { accent_color?: string | null; slug?: string | null } | null,
): string {
  const raw = (community?.accent_color as string | undefined)?.trim();
  if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  return hiveMark(community?.slug).accent;
}

/** Split a #rrggbb into its three numbers. Anything else comes back as gold's. */
function channels(hex: string): [number, number, number] {
  const clean = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return [189, 147, 72];
  return [
    parseInt(clean.slice(1, 3), 16),
    parseInt(clean.slice(3, 5), 16),
    parseInt(clean.slice(5, 7), 16),
  ];
}

/** The accent as a wash — for a selected tab's fill, or a soft border. */
export function accentWash(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * How bright a colour is, 0–1. Used to decide what can sit ON the accent and
 * whether the accent itself can be read as ink.
 *
 * Gold lands around 0.61, Tech's blue around 0.28, Production's purple similar.
 * That gap is why the app could get away with assuming gold for so long: gold
 * is light enough to read as text on cream AND dark enough to carry white on
 * top. The other two are not, and every place that assumed one accent behaves
 * like gold is a place they break.
 */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * The accent, lifted until it can be read as text on a dark page.
 *
 * Tech's #2f4a63 on HIVE-Wide's near-black is about 1.9:1 — a HIVE name nobody
 * can see. This keeps the hue and raises the lightness until it can be.
 *
 * The lift used to be 0.55, which pushed every non-gold accent most of the
 * way to white — Tech's blue and Production's purple both landed as close to
 * the same pale gray, impossible to tell apart in a small dot (Nat,
 * 2026-08-25). 0.3 keeps both comfortably above the 4.5:1 text-contrast floor
 * on `#0B0B12` while leaving enough of the original hue that a blue still
 * reads as blue next to a purple.
 */
export function accentOnDark(hex: string): string {
  const [r, g, b] = channels(hex);
  const lift = (c: number) => Math.round(c + (255 - c) * 0.3);
  return luminance(hex) > 0.45 ? hex : `rgb(${lift(r)},${lift(g)},${lift(b)})`;
}

/**
 * "Hive" → "HIVE", anywhere a person typed a meeting title.
 *
 * The house rule is "HIVE" in product copy, never "the Hive" or a mixed-case
 * variant — and a meeting title is one of the few places a member types the
 * brand themselves, so it is the one place it drifts.
 *
 * Lived as an identical private const in `meetings.tsx` and
 * `ScheduleMeetingModal.tsx`, and HIVE-Wide's meetings box needed a third
 * copy on 2026-08-12. Three is a shared function; it belongs beside
 * `hiveDisplayName`, which is the same job for a HIVE's own name.
 */
export const normalizeHiveBrandText = (text?: string | null) =>
  (text ?? '').replace(/\bHive\b/g, 'HIVE');

/**
 * The accent, darkened until it can be read as a heading on cream.
 *
 * The opposite job to `accentOnDark`. Gold sits at 0.61 luminance — bright
 * enough that a heading in it on `#fffdf5` reads as a highlight rather than
 * words, which is why gold's deep ink `#8a5a16` was written by hand in a dozen
 * places. Tech's blue and Production's purple are already dark enough to read
 * as-is, so they come back untouched.
 */
export function accentInk(hex: string): string {
  const [r, g, b] = channels(hex);
  if (luminance(hex) <= 0.45) return hex;
  const drop = (c: number) => Math.round(c * 0.58);
  return `rgb(${drop(r)},${drop(g)},${drop(b)})`;
}

/**
 * One HIVE's accent, in the four weights a form needs.
 *
 * Nat, 2026-09-01: surveys still wore honey gold inside Tech HIVE and
 * Production HIVE — every number chip, every selected answer, every button,
 * in a HIVE whose whole shell is blue or purple.
 *
 * Gold returns its EXACT hand-tuned family rather than anything computed, so
 * OG HIVE — where gold is correct and every one of these values was chosen by
 * eye over six months — does not shift by a single pixel. Only a HIVE that was
 * wearing somebody else's colour changes.
 *
 *  - `accent` — solid fills, chips, buttons, the required star
 *  - `ink`    — a heading sitting on `wash`
 *  - `wash`   — the soft panel behind a hint or a picker
 *  - `line`   — borders, at whatever alpha the caller already used
 */
export function accentPalette(accent: string): {
  accent: string;
  ink: string;
  wash: string;
  line: (alpha: number) => string;
} {
  if (accent.trim().toLowerCase() === HIVE_GOLD) {
    return {
      accent: HIVE_GOLD,
      ink: '#8a5a16',
      wash: '#fdf3dc',
      line: (alpha) => `rgba(222,193,129,${alpha})`,
    };
  }
  return {
    accent,
    ink: accentInk(accent),
    wash: accentWash(accent, 0.1),
    // The gold line is a LIGHTER gold than the accent itself, so matching its
    // weight means easing off the alpha rather than reusing it raw.
    line: (alpha) => accentWash(accent, alpha * 0.72),
  };
}

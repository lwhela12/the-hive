import { HIVE_GOLD, accentWash, accentOnDark } from './hiveBrand';

/**
 * Whose it is, and how far it goes — decided once, for the whole app.
 *
 * Nat, 2026-08-05: *"instead of relying on people reading, I want colour coding
 * for quick noticing if something is this HIVE or HIVE-Wide — consistent
 * shapes, sizes, emoji, colour coding."*
 *
 * She asked for this on 2026-08-02 as well, and the reason it didn't take is
 * that four different places were each inventing their own answer: `ScopeBadge`
 * drew cream pills with a padlock and a bee, `ScopeBadgeSample` in the HIVE-Wide
 * welcome drew outlined pills in the HIVE's colour with no icon at all,
 * `WishScopePicker` drew gold radio buttons, and the event audience toggle drew
 * a third thing. So the app taught members a colour ladder on the welcome page
 * and then never used it again. **A vocabulary used in one place is a private
 * joke, not a system.** This file is the vocabulary; everything else reads it.
 *
 * ## The two facts, kept apart on purpose
 *
 * A thing in HIVE has an owner and a reach, and they are different questions:
 *
 * - **Whose is it?** → a filled hexagon in that HIVE's own colour. OG gold,
 *   Tech blue, Production purple. `HiveMark`.
 * - **How far does it go?** → the Earth for HIVE-Wide, a megaphone for public.
 *   `WorldMark`, which is the same planet the HIVE-Wide page is a photograph of.
 *
 * Something that stays home wears only its hexagon. There is no "This HIVE
 * only" chip any more, because the hexagon already said it and a member should
 * not have to read a sentence to learn nothing changed. Something that travels
 * wears its hexagon AND the world, so you can see at a glance both which HIVE
 * an August meeting belongs to and that everyone is invited.
 *
 * ## Why HIVE-Wide is black, and not green
 *
 * Anything that leaves a HIVE has to wear a colour no HIVE can claim, or
 * "further away" would read as "belongs to whoever owns that colour". That used
 * to be a green, and green was retired on 2026-08-03 when HIVE-Wide became
 * space: the rail and the header have been `#0B0B12` ever since. Messaging kept
 * the green for a day and the HIVE-Wide row in Messages was green while the
 * HIVE-Wide row in the rail two inches away was black — which is how these
 * things go wrong. So HIVE-Wide is the same near-black the globe hangs in, and
 * the Earth on the chip is the same Earth the page is a photograph of.
 *
 * ## Why public is teal, and not more black
 *
 * Until 2026-08-06 the ladder was weight alone: your HIVE a soft wash of its own
 * colour, HIVE-Wide that black outlined, public that same black filled in. The
 * idea was that the further a thing goes, the more solid it looks.
 *
 * It taught the opposite. Nat, 2026-08-06, on an event card in OG HIVE: *"It
 * looks like it is marked as 'public' which would mean that we could see it. But
 * 'public' is in black, and isn't black supposed to be more like HIVE-Wide
 * colors?"* She read the colour, decided the card said HIVE-Wide, and stopped.
 * A filled black pill and an outlined black pill are the same colour, colour is
 * what a person reads first, and filled-versus-outlined is far too fine a
 * distinction to carry the difference between "everyone in the HIVEs" and
 * "anybody on the internet" — which is the most consequential line in the app.
 *
 * So public is the one rung with a colour of its own: `#0C7C7C`, a teal. It sits
 * at hue 180°, which puts it as far as one colour can get from every colour this
 * app has already spoken for — the same distance from Tech HIVE's blue (209°) as
 * from the retired green (148°), a long way from OG's gold (38°) and Show HIVE's
 * purple (269°), and a long way from the red that means an error or a Delete.
 * Public is a choice a member is allowed to make, so it reads as a signal.
 *
 * **No HIVE may be given `#0C7C7C` as its accent colour.** That is the whole
 * point: the two rungs that leave a HIVE wear colours nobody in the app owns.
 *
 * The ladder now reads as three different things rather than three weights:
 * your HIVE is a wash of its own colour behind its hexagon, HIVE-Wide is
 * near-black behind the Earth, public is solid teal behind the megaphone.
 *
 * Public looks the same on cream and on the HIVE-Wide night sky — one colour,
 * one badge, wherever you are standing. It used to invert to a cream fill on
 * dark pages, which meant the single most consequential rung in the app looked
 * like two different badges depending on which page you were on.
 */

export type ScopeKey = 'hive' | 'all_hives' | 'public';

/**
 * The colour that belongs to no HIVE. Same value as `HIVE_WIDE_MARK` in
 * `components/messaging/hiveWideRoom.ts`, which is where it was first written
 * down; this is the copy the badges read.
 */
export const HIVE_WIDE_INK = '#0B0B12';

/**
 * The colour of the rung that leaves the HIVEs entirely.
 *
 * Reserved: no HIVE gets this as an accent. See the note at the top of the file
 * for how it was picked and why public stopped being black on 2026-08-06.
 *
 * It carries white text at 5.0:1, sits at 4.9:1 against a cream card and 4.0:1
 * against the HIVE-Wide sky, so one value reads on both pages and public never
 * has to change shape to survive a dark background.
 */
export const PUBLIC_MARK = '#0C7C7C';

/**
 * The old green, kept only because a couple of surfaces still import it by
 * name. Nothing new should reach for it — see the note above.
 * @deprecated Use `HIVE_WIDE_INK`.
 */
export const HIVE_WIDE_GREEN = '#3F7D5C';

/**
 * Events say `members`, wishes and survey answers say `hive`, and both mean the
 * room you joined. A missing or unrecognised value means home — the safe end of
 * the ladder is always the one that travels least.
 */
export function normaliseScope(raw?: string | null): ScopeKey {
  if (raw === 'public') return 'public';
  if (raw === 'all_hives') return 'all_hives';
  return 'hive';
}

/** Does this need a reach chip at all, or does its hexagon already say it? */
export function travels(scope?: string | null): boolean {
  return normaliseScope(scope) !== 'hive';
}

/**
 * One set of numbers for every chip in the app, so a wish badge and a meeting
 * badge are the same object at the same size rather than two near-misses.
 *
 * `sm` is for dense lists — a wish card's header, a row in a board index.
 * `md` is for a thing you are looking AT: an event card, a post detail.
 */
export type ChipSize = 'sm' | 'md';

export const CHIP: Record<ChipSize, {
  mark: number; text: number; gap: number; padX: number; padY: number;
}> = {
  sm: { mark: 11, text: 10.5, gap: 5, padX: 8, padY: 3 },
  md: { mark: 14, text: 12, gap: 6, padX: 11, padY: 5 },
};

export type ChipLook = {
  label: string;
  /**
   * The colour this rung IS, at full strength — the HIVE's accent, HIVE-Wide's
   * near-black, public's teal.
   *
   * Every rung carries one so that anything drawing a rung somewhere OTHER than
   * a chip has a colour to reach for and never has to guess. `ScopePicker` used
   * to guess, with a hand-written "public is black" special case that survived
   * public no longer being black.
   */
  accent: string;
  bg: string;
  border: string;
  ink: string;
};

/**
 * How a HIVE's own chip looks: its colour, at a weight that reads on this page.
 *
 * `tone` matters more than it looks. Tech's `#2f4a63` on the near-black
 * HIVE-Wide page is about a 1.9:1 contrast — a HIVE name nobody can see — so on
 * dark surfaces the ink is the accent lifted, not the accent. This is the same
 * trap that shipped a black header over a cream page with invisible tabs.
 */
export function hiveChipLook(
  accent: string | null | undefined,
  tone: 'light' | 'dark' = 'light',
  name?: string | null,
): ChipLook {
  const colour = accent && /^#[0-9a-fA-F]{6}$/.test(accent.trim()) ? accent.trim() : HIVE_GOLD;
  return {
    accent: colour,
    label: (name ?? '').trim() || 'HIVE',
    bg: accentWash(colour, tone === 'dark' ? 0.16 : 0.1),
    border: accentWash(colour, tone === 'dark' ? 0.55 : 0.4),
    ink: tone === 'dark' ? accentOnDark(colour) : colour,
  };
}

/** How the reach chip looks. Only ever asked for when `travels()` is true. */
export function reachChipLook(
  scope: ScopeKey,
  tone: 'light' | 'dark' = 'light',
): ChipLook {
  if (scope === 'public') {
    // The same solid teal wherever you are standing. `tone` is deliberately
    // ignored here: the rung where a thing leaves the HIVEs is the one that
    // most needs to look identical on every page, and this colour reads on
    // cream and on the night sky alike. It used to flip to a cream fill on
    // dark, which gave the most consequential badge in the app two faces.
    return {
      label: 'Public',
      accent: PUBLIC_MARK,
      bg: PUBLIC_MARK,
      border: PUBLIC_MARK,
      ink: '#ffffff',
    };
  }
  return {
    label: 'HIVE-Wide',
    accent: HIVE_WIDE_INK,
    bg: tone === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(11,11,18,0.06)',
    border: tone === 'dark' ? 'rgba(255,255,255,0.34)' : 'rgba(11,11,18,0.34)',
    ink: tone === 'dark' ? 'rgba(255,255,255,0.86)' : HIVE_WIDE_INK,
  };
}

/**
 * What a screen reader hears, since the whole point of this system is that the
 * sighted reading is a colour and a shape. Somebody using VoiceOver gets the
 * sentence the chips replaced.
 */
export function scopeSpoken(scope: ScopeKey, hiveName?: string | null): string {
  const hive = (hiveName ?? '').trim() || 'your HIVE';
  // Public says where it went, not just how many people can see it. Somebody
  // hearing "public" alone can land where Nat's eye did on 2026-08-06 and take
  // it for a wider room inside HIVE.
  if (scope === 'public') return `${hive}. Public — this is outside the HIVEs, where anyone can read it.`;
  if (scope === 'all_hives') return `${hive}. HIVE-Wide — everyone in every HIVE can see this.`;
  return `${hive} only.`;
}

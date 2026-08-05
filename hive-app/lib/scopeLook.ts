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
 * ## Why travel is black, and not green
 *
 * Anything that leaves a HIVE has to wear a colour no HIVE can claim, or
 * "further away" would read as "belongs to whoever owns that colour". That used
 * to be a green, and green was retired on 2026-08-03 when HIVE-Wide became
 * space: the rail and the header have been `#0B0B12` ever since. Messaging kept
 * the green for a day and the HIVE-Wide row in Messages was green while the
 * HIVE-Wide row in the rail two inches away was black — which is how these
 * things go wrong. So travel is the same near-black the globe hangs in, and the
 * Earth on the chip is the same Earth the page is a photograph of.
 *
 * The ladder is weight: your HIVE is a soft wash of its own colour, HIVE-Wide is
 * that black outlined, public is that black filled in. The further it goes, the
 * more solid it looks, before anybody reads a word.
 */

export type ScopeKey = 'hive' | 'all_hives' | 'public';

/**
 * The colour that belongs to no HIVE. Same value as `HIVE_WIDE_MARK` in
 * `components/messaging/hiveWideRoom.ts`, which is where it was first written
 * down; this is the copy the badges read.
 */
export const HIVE_WIDE_INK = '#0B0B12';

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
): ChipLook & { accent: string } {
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
    // Filled: it has left the HIVEs entirely and anyone can read it. On a dark
    // page a black fill would vanish into the background, so it inverts —
    // solid still means "furthest", which is the part that has to survive.
    return tone === 'dark'
      ? { label: 'Public', bg: '#F2EFE6', border: '#F2EFE6', ink: HIVE_WIDE_INK }
      : { label: 'Public', bg: HIVE_WIDE_INK, border: HIVE_WIDE_INK, ink: '#ffffff' };
  }
  return {
    label: 'HIVE-Wide',
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
  if (scope === 'public') return `${hive}. Public — anyone can read this.`;
  if (scope === 'all_hives') return `${hive}. HIVE-Wide — everyone in every HIVE can see this.`;
  return `${hive} only.`;
}

import { useAuth } from './hooks/useAuth';

/**
 * What colour a page is, depending on where the reader is standing.
 *
 * HIVE-Wide is space — black, with the globe behind it. For a while only the
 * header knew that, which left a black bar sitting on a cream page and looked
 * like a mistake rather than a place ("space header & background throughout",
 * Nat 2026-08-03).
 *
 * Screens ask for a skin instead of hard-coding cream and charcoal, so the
 * whole page turns over together. The light values are exactly what those
 * screens already used, so nothing moves for somebody standing in a HIVE.
 *
 * This is a palette, not a theme system. It covers page, card, rule and text —
 * the four things every screen here is made of — and deliberately stops there.
 */
export type PageSkin = {
  dark: boolean;
  /** Behind everything. */
  page: string;
  /** A card, panel or row sitting on the page. */
  card: string;
  /** The same card while it's being pressed. */
  cardPressed: string;
  /** Hairlines, card edges, dividers. */
  border: string;
  /** A slightly stronger rule, for things that separate sections. */
  borderStrong: string;
  /** Titles and body copy. */
  ink: string;
  /** Body copy that isn't a title. */
  inkBody: string;
  /** Dates, counts, captions. */
  inkSoft: string;
  /** Placeholder text and disabled things. */
  inkFaint: string;
  /** The gold, adjusted so it still reads on whichever background. */
  gold: string;
  /** A field you type into. */
  field: string;
};

const LIGHT: PageSkin = {
  dark: false,
  page: '#faf8f3',
  card: '#fffdf5',
  cardPressed: '#fdf8ec',
  border: 'rgba(189,147,72,0.24)',
  borderStrong: 'rgba(189,147,72,0.5)',
  ink: '#313130',
  inkBody: '#4b4740',
  inkSoft: '#8e7a5e',
  inkFaint: 'rgba(49,49,48,0.34)',
  gold: '#bd9348',
  field: '#ffffff',
};

const DARK: PageSkin = {
  dark: true,
  // Not the same black as the rail. The page sits a shade above it so the two
  // read as page-on-furniture rather than one flat void.
  page: '#07080F',
  card: 'rgba(255,255,255,0.05)',
  cardPressed: 'rgba(255,255,255,0.09)',
  border: 'rgba(255,255,255,0.11)',
  borderStrong: 'rgba(255,255,255,0.18)',
  ink: '#F6F4E5',
  inkBody: 'rgba(246,244,229,0.84)',
  inkSoft: 'rgba(246,244,229,0.58)',
  inkFaint: 'rgba(246,244,229,0.34)',
  // The HIVE gold goes muddy on black; this is the same hue lifted until it
  // reads at the same strength it does on cream.
  gold: '#e0be76',
  field: 'rgba(255,255,255,0.07)',
};

/** The skin for wherever this reader is standing right now. */
export function usePageSkin(): PageSkin {
  const { wholeHive } = useAuth();
  return wholeHive ? DARK : LIGHT;
}

/** The skin for a page that is ALWAYS HIVE-Wide, whoever opened it. */
export const SPACE_SKIN = DARK;
export const HIVE_SKIN = LIGHT;

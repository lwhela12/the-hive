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

/** The colour of this hive's header bar. Null/blank/malformed falls back to gold. */
export function hiveAccent(community?: Community | null): string {
  const raw = (community?.accent_color as string | undefined)?.trim();
  if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  return HIVE_GOLD;
}

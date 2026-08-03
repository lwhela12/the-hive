import { supabase } from './supabase';
import type { Profile } from '../types';

/**
 * What you've already seen, kept on your profile rather than in a browser.
 *
 * localStorage belongs to a device. Mark things read on a laptop, open a phone,
 * and it's all unread again — and the what's-new banner reintroduces itself
 * every time (Nat 2026-08-02). Read state is a fact about a person.
 *
 * Shape, per community: { "<community_id>": { at: iso, ids: [...] } }
 */

type PerCommunity = { at?: string; ids?: string[] };
type ReadMap = Record<string, PerCommunity>;

// The feed only ever shows so much; there's no reason to remember further back.
const MAX_IDS = 300;

const readMap = (profile?: Profile | null): ReadMap => {
  const raw = profile?.activity_read_ids;
  return raw && typeof raw === 'object' ? (raw as ReadMap) : {};
};

export function loadActivityRead(profile: Profile | null | undefined, communityId: string | null) {
  if (!communityId) return { at: null as string | null, ids: new Set<string>() };
  const entry = readMap(profile)[communityId] ?? {};
  return {
    at: entry.at ?? null,
    ids: new Set<string>(Array.isArray(entry.ids) ? entry.ids : []),
  };
}

/**
 * Fire and forget: the screen has already updated, and a failed write only
 * costs us this device's memory of it until the next mark.
 */
export async function persistActivityRead(
  profile: Profile | null | undefined,
  communityId: string | null,
  next: { at?: string | null; ids?: Set<string> }
) {
  if (!profile?.id || !communityId) return;

  const current = readMap(profile);
  const existing = current[communityId] ?? {};
  const ids = next.ids ? [...next.ids].slice(-MAX_IDS) : existing.ids ?? [];
  const at = next.at ?? existing.at;

  const merged: ReadMap = { ...current, [communityId]: { ...(at ? { at } : {}), ids } };

  // Keep the in-memory profile honest so the next read doesn't undo this.
  (profile as any).activity_read_ids = merged;

  const { error } = await supabase
    .from('profiles')
    .update({ activity_read_ids: merged } as never)
    .eq('id', profile.id);

  if (error) console.error('[readState] could not save read state:', error.message);
}

export function loadAppNewsSeen(profile: Profile | null | undefined): string | null {
  return (profile?.app_news_seen_id as string | undefined) ?? null;
}

export async function persistAppNewsSeen(profile: Profile | null | undefined, id: string) {
  if (!profile?.id || loadAppNewsSeen(profile) === id) return;
  (profile as any).app_news_seen_id = id;

  const { error } = await supabase
    .from('profiles')
    .update({ app_news_seen_id: id } as never)
    .eq('id', profile.id);

  if (error) console.error('[readState] could not save what\'s-new marker:', error.message);
}

import type { Community, Profile } from '../types';
import { hiveAccent } from './hiveBrand';
import type { TaggableHive } from './mentions';
import { supabase } from './supabase';

/**
 * Who a picker can offer, and which HIVEs can be tagged as a whole.
 *
 * The people half has always been one HIVE at a time, and stays that way: a
 * screen asks for the HIVE it is standing in, row-level security decides what
 * comes back. The HIVE half is new — see `lib/mentions.ts` for why "everyone"
 * needed to start saying whose everyone.
 */

export type MentionableMember = Pick<Profile, 'id' | 'name'> & { avatar_url?: string | null };

/** Just enough of a membership row to name and colour a HIVE. */
type MembershipLike = {
  community_id: string;
  community?: Pick<Community, 'id' | 'name' | 'accent_color'> | null;
};

/**
 * The people, out of the membership rows and their profiles together.
 *
 * `profiles!inner(...)` is the whole shape: a membership row comes back with
 * the person attached, because `community_memberships` has a foreign key to
 * `profiles` and the database can follow it itself. It was two trips — ask who
 * is in the HIVE, wait, then ask who those people are — and the second could
 * not start until the first had landed. Measured against the live database on
 * 2026-08-06: 141 ms then 148 ms, against 145 ms for the pair as one question.
 *
 * Row-level security is unchanged by this. `!inner` drops a membership whose
 * profile you may not read, which is the same answer the second query used to
 * give by simply not returning that row. Proven from two accounts on
 * 2026-08-06: asking for a HIVE you are not in returns nothing, either way.
 */
function membersFromJoinedRows(rows: any[] | null | undefined): MentionableMember[] {
  const byId = new Map<string, MentionableMember>();
  for (const row of rows ?? []) {
    const person = row?.profiles;
    if (!person?.id || !person?.name) continue;
    byId.set(person.id, person as MentionableMember);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchCommunityMentionableMembers(communityId: string): Promise<MentionableMember[]> {
  const { data, error } = await supabase
    .from('community_memberships')
    .select('user_id, profiles!inner(id, name, avatar_url)')
    .eq('community_id', communityId);

  if (error) {
    console.warn('[Mentions] community members load failed', error);
    return [];
  }

  return membersFromJoinedRows(data as any[]);
}

/**
 * The HIVEs a person belongs to, in the shape a mention picker wants.
 *
 * Straight off the memberships already in the auth context, so offering
 * "@OG" costs nothing and needs no round trip. It is deliberately only the
 * HIVEs this person is IN: those are the ones whose member list they are
 * allowed to read, so those are the ones a client can turn into notifications
 * on its own. Tagging a HIVE somebody is not a member of needs the fan-out to
 * happen server-side — see `lib/mentions.ts`.
 */
export function taggableHivesFromMemberships(memberships?: MembershipLike[] | null): TaggableHive[] {
  return (memberships ?? [])
    .map((membership) => {
      const community = membership.community;
      const id = community?.id || membership.community_id;
      if (!id) return null;
      return {
        id,
        name: (community?.name ?? '').trim() || 'HIVE',
        accent: hiveAccent(community),
      } as TaggableHive;
    })
    .filter((hive): hive is TaggableHive => !!hive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One HIVE, in the same shape, for the place you are standing right now. */
export function taggableHiveFromCommunity(
  community?: Pick<Community, 'id' | 'name' | 'accent_color'> | null
): TaggableHive | null {
  if (!community?.id) return null;
  return {
    id: community.id,
    name: (community.name ?? '').trim() || 'HIVE',
    accent: hiveAccent(community),
  };
}

/**
 * Everybody in several HIVEs at once, de-duplicated — somebody in two HIVEs is
 * one person and gets one notification.
 *
 * Row-level security still decides: ask for a HIVE you are not in and its
 * members simply do not come back. A short list is the honest answer to "who
 * can this client reach", never a reason to widen the query.
 */
export async function fetchMentionableMembersForHives(
  communityIds: string[]
): Promise<MentionableMember[]> {
  const ids = Array.from(new Set(communityIds.filter(Boolean)));
  if (ids.length === 0) return [];

  // One trip, same as the single-HIVE version above, and the de-duplication
  // that already had to happen anyway now does both jobs: somebody in two of
  // these HIVEs arrives on two membership rows and leaves as one person.
  const { data, error } = await supabase
    .from('community_memberships')
    .select('user_id, profiles!inner(id, name, avatar_url)')
    .in('community_id', ids);

  if (error) {
    console.warn('[Mentions] multi-HIVE members load failed', error);
    return [];
  }

  return membersFromJoinedRows(data as any[]);
}

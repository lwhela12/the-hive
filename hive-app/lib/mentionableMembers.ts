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

export async function fetchCommunityMentionableMembers(communityId: string): Promise<MentionableMember[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('community_memberships')
    .select('user_id')
    .eq('community_id', communityId);

  if (membershipError) {
    console.warn('[Mentions] community memberships load failed', membershipError);
    return [];
  }

  const userIds = (memberships ?? []).map((row: any) => row.user_id).filter(Boolean);
  if (userIds.length === 0) return [];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    console.warn('[Mentions] member profiles load failed', profilesError);
    return [];
  }

  return (profilesData ?? [])
    .filter((user: any): user is MentionableMember => !!user?.id && !!user?.name)
    .sort((a, b) => a.name.localeCompare(b.name));
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

  const { data: memberships, error: membershipError } = await supabase
    .from('community_memberships')
    .select('user_id')
    .in('community_id', ids);

  if (membershipError) {
    console.warn('[Mentions] multi-HIVE memberships load failed', membershipError);
    return [];
  }

  const userIds = Array.from(
    new Set((memberships ?? []).map((row: any) => row.user_id).filter(Boolean))
  );
  if (userIds.length === 0) return [];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    console.warn('[Mentions] multi-HIVE profiles load failed', profilesError);
    return [];
  }

  return (profilesData ?? [])
    .filter((user: any): user is MentionableMember => !!user?.id && !!user?.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

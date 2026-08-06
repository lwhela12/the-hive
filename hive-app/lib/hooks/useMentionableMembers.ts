import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchCommunityMentionableMembers,
  taggableHiveFromCommunity,
  taggableHivesFromMemberships,
  MentionableMember,
} from '../mentionableMembers';
import { queryKeys } from '../queryClient';
import type { MentionReach, TaggableHive } from '../mentions';
import { useAuth } from './useAuth';

/**
 * How long the list of who is in a HIVE stays good for.
 *
 * Ten minutes, because people join a HIVE by invitation and a directory that
 * is a few minutes behind has never been the reason a mention failed. What it
 * buys is the whole point: within that window, opening a composer costs nothing
 * at all.
 */
const MENTIONABLE_STALE_MS = 10 * 60 * 1000;

/**
 * The people a picker can offer, for the HIVE a screen is standing in.
 *
 * This is asked for by nine different composers — a member card, both board
 * composers, the chat box, a room, a wish, the monthly check-in, The Buzz — and
 * it used to be a plain fetch held in the screen's own state, which meant every
 * single open paid for it again. Opening a member card, closing it and opening
 * it again was two round trips each time, and the list it fetched was the same
 * list both times. Nat, 2026-08-06: *"still long load time for members page."*
 *
 * It goes through TanStack Query now, on one key per HIVE, so the first open
 * pays for it and every open after that is instant — including from a
 * different screen, because they all share the one cache.
 *
 * `providedMembers` still wins where a caller already knows the answer: a DM or
 * a group chat is a closed room and its members are the people in it, which no
 * database round trip could tell you better.
 */
export function useMentionableMembers(
  communityId?: string | null,
  providedMembers: MentionableMember[] = []
) {
  const hasProvidedMembers = providedMembers.length > 0;
  const shouldFetch = !hasProvidedMembers && !!communityId;

  const { data, isLoading } = useQuery<MentionableMember[]>({
    queryKey: queryKeys.mentionableMembers(communityId ?? ''),
    enabled: shouldFetch,
    staleTime: MENTIONABLE_STALE_MS,
    queryFn: () => fetchCommunityMentionableMembers(communityId!),
  });

  const loadedMembers = data;

  return useMemo(
    () => ({
      members: hasProvidedMembers ? providedMembers : loadedMembers ?? [],
      // A disabled query is never loading — TanStack reports it as pending
      // forever, which is a picker that says "finding people" about a HIVE it
      // was never asked to look in.
      loading: shouldFetch && isLoading,
    }),
    [hasProvidedMembers, isLoading, loadedMembers, providedMembers, shouldFetch]
  );
}

type MentionReachOptions = {
  /**
   * How far the thing being written travels: `chat_rooms.reach`,
   * `board_categories.reach`, or a wish's `share_scope`. Left out, the picker
   * settles on this HIVE only — the answer that cannot leak.
   */
  reach?: string | null;
  /** The HIVE it is being written in. Defaults to the one you are standing in. */
  hive?: TaggableHive | null;
  /**
   * The host HIVE's ceiling, `communities.max_share_scope`. Defaults to the
   * ceiling of the HIVE you are standing in, which is right whenever the
   * writing is hosted where you are.
   */
  ceiling?: string | null;
  /**
   * Set for a DM or a group chat: "everyone" is the handful of people in it and
   * nothing wider is offered.
   */
  closedRoom?: { label: string; description?: string } | null;
};

/**
 * What "everyone" means where this screen is standing.
 *
 * One object, handed to the picker and read again when the message is sent, so
 * a row can never be offered that the send would then quietly drop. The HIVEs
 * on offer are the ones this person belongs to — the only ones whose member
 * list they can read, and so the only ones a client can turn into notifications
 * by itself.
 */
export function useMentionReach(options: MentionReachOptions = {}): MentionReach {
  const { community, memberships } = useAuth();
  const { reach, hive, ceiling, closedRoom } = options;

  const standingIn = useMemo(() => taggableHiveFromCommunity(community), [community]);
  const allHives = useMemo(() => taggableHivesFromMemberships(memberships), [memberships]);

  return useMemo(() => {
    const home = hive ?? standingIn;
    return {
      hive: home,
      reach,
      ceiling: ceiling ?? (community?.max_share_scope as string | undefined) ?? null,
      otherHives: allHives.filter((candidate) => candidate.id !== home?.id),
      closedRoom: closedRoom ?? null,
    };
  }, [
    allHives,
    ceiling,
    closedRoom?.description,
    closedRoom?.label,
    community?.max_share_scope,
    hive?.id,
    reach,
    standingIn?.id,
  ]);
}

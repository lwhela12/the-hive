import { useEffect, useMemo, useState } from 'react';
import {
  fetchCommunityMentionableMembers,
  taggableHiveFromCommunity,
  taggableHivesFromMemberships,
  MentionableMember,
} from '../mentionableMembers';
import type { MentionReach, TaggableHive } from '../mentions';
import { useAuth } from './useAuth';

/** The people a picker can offer, for the HIVE a screen is standing in. */
export function useMentionableMembers(
  communityId?: string | null,
  providedMembers: MentionableMember[] = []
) {
  const [loadedMembers, setLoadedMembers] = useState<MentionableMember[]>([]);
  const [loading, setLoading] = useState(false);
  const hasProvidedMembers = providedMembers.length > 0;

  useEffect(() => {
    if (hasProvidedMembers) {
      setLoading(false);
      return;
    }

    if (!communityId) {
      setLoadedMembers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoadedMembers([]);
    setLoading(true);

    fetchCommunityMentionableMembers(communityId)
      .then((members) => {
        if (!cancelled) setLoadedMembers(members);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [communityId, hasProvidedMembers]);

  return useMemo(
    () => ({
      members: hasProvidedMembers ? providedMembers : loadedMembers,
      loading: !hasProvidedMembers && loading,
    }),
    [hasProvidedMembers, loadedMembers, loading, providedMembers]
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

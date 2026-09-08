import type { Profile } from '../types';

export const PRIVATE_HIVE_WIDE_AUTHOR_NAME = 'HIVE member';

export type ContextualAuthorIdentity = Pick<Profile, 'id' | 'name'> & {
  avatar_url?: string | null;
  profile_scope?: Profile['profile_scope'];
  community_memberships?: Array<{ community_id: string | null }> | null;
};

/**
 * A shared thing may travel farther than the person who wrote it.
 *
 * `identityCommunityId` describes WHERE the viewer is standing, not how far
 * the board travels:
 *
 * - `null` is HIVE-Wide: only a profile explicitly shared HIVE-Wide travels.
 * - a HIVE id is that HIVE: its own members know one another, while an author
 *   from another HIVE stays anonymous unless their profile travels.
 * - `undefined` is a caller that is not a contextual HIVE surface, so this
 *   helper leaves its established identity treatment alone.
 *
 * Missing scope or membership data fails closed whenever a contextual surface
 * asks the question. A narrower select must never turn into an identity leak.
 */
export function getBoardAuthorIdentity(
  author: ContextualAuthorIdentity | null | undefined,
  identityCommunityId: string | null | undefined,
) {
  const isInViewingHive = typeof identityCommunityId === 'string'
    && author?.community_memberships?.some((membership) => membership.community_id === identityCommunityId);
  const identityIsGated = identityCommunityId !== undefined;
  const isAnonymous = identityIsGated
    && author?.profile_scope !== 'all_hives'
    && !isInViewingHive;

  return {
    isAnonymous,
    memberId: isAnonymous ? null : author?.id ?? null,
    name: isAnonymous ? PRIVATE_HIVE_WIDE_AUTHOR_NAME : author?.name || 'Unknown',
    avatarUrl: isAnonymous ? null : author?.avatar_url ?? null,
  };
}

/** HIVE-Wide Home uses the same wording as the shared board it points to. */
export function getHiveWideActivityAuthorName(author: ContextualAuthorIdentity | null | undefined) {
  return getBoardAuthorIdentity(author, null).name;
}

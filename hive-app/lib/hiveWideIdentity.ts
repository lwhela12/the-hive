import type { BoardCategory, Profile } from '../types';

export const PRIVATE_HIVE_WIDE_AUTHOR_NAME = 'HIVE member';

type AuthorIdentity = Pick<Profile, 'id' | 'name'> & {
  avatar_url?: string | null;
  profile_scope?: Profile['profile_scope'];
};

/**
 * A shared thing may travel farther than the person who wrote it.
 *
 * On a HIVE-Wide board, the author gets a face/name/profile link only when
 * their profile is explicitly shared HIVE-Wide. Missing scope is private on
 * purpose: older or narrower selects must never turn into an identity leak.
 * Inside a person's own HIVE, the ordinary author treatment is unchanged.
 */
export function getBoardAuthorIdentity(
  author: AuthorIdentity | null | undefined,
  boardReach: BoardCategory['reach'] | null | undefined,
) {
  const isAnonymous = boardReach === 'all_hives' && author?.profile_scope !== 'all_hives';

  return {
    isAnonymous,
    memberId: isAnonymous ? null : author?.id ?? null,
    name: isAnonymous ? PRIVATE_HIVE_WIDE_AUTHOR_NAME : author?.name || 'Unknown',
    avatarUrl: isAnonymous ? null : author?.avatar_url ?? null,
  };
}

/** HIVE-Wide Home uses the same wording as the shared board it points to. */
export function getHiveWideActivityAuthorName(author: AuthorIdentity | null | undefined) {
  return author?.profile_scope === 'all_hives'
    ? author.name || 'Unknown'
    : PRIVATE_HIVE_WIDE_AUTHOR_NAME;
}

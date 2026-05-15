import { useEffect, useMemo, useState } from 'react';
import { fetchCommunityMentionableMembers, MentionableMember } from '../mentionableMembers';

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

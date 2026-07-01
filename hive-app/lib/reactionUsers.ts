import { supabase } from './supabase';
import type { ReactionUserProfile } from '../types';

type ReactionWithUser = {
  user_id?: string | null;
  user?: ReactionUserProfile | null;
};

export async function attachReactionUsers<T extends ReactionWithUser>(
  reactions: T[] | null | undefined
): Promise<T[]> {
  const reactionRows = reactions ?? [];
  const userIds = Array.from(
    new Set(reactionRows.map((reaction) => reaction.user_id).filter((id): id is string => !!id))
  );

  if (userIds.length === 0) return [...reactionRows];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  if (error) {
    console.warn('[reactionUsers] profile lookup failed', error);
    return [...reactionRows];
  }

  const profilesById = new Map<string, ReactionUserProfile>();
  (data ?? []).forEach((profile) => {
    profilesById.set(profile.id, {
      id: profile.id,
      name: profile.name,
      avatar_url: profile.avatar_url ?? null,
    });
  });

  return reactionRows.map((reaction) => ({
    ...reaction,
    user: reaction.user_id ? profilesById.get(reaction.user_id) ?? reaction.user ?? null : reaction.user ?? null,
  }));
}

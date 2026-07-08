import { supabase } from './supabase';

type DeleteWishParams = {
  wishId: string;
  communityId: string;
  ownerId?: string | null;
};

export async function deleteWishById({
  wishId,
  communityId,
  ownerId,
}: DeleteWishParams): Promise<{ error: Error | null }> {
  let query = (supabase as any)
    .from('wishes')
    .delete()
    .eq('id', wishId)
    .eq('community_id', communityId);

  if (ownerId) {
    query = query.eq('user_id', ownerId);
  }

  const { data, error } = await query.select('id').maybeSingle();

  if (error) {
    return { error };
  }

  if (!data) {
    return { error: new Error('No matching wish was deleted.') };
  }

  return { error: null };
}

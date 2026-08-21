import { supabase } from './supabase';

type DeleteWishParams = {
  wishId: string;
  communityId: string;
  ownerId?: string | null;
};

/**
 * Taking a wish off the lists.
 *
 * This used to be a real SQL DELETE. `wish_comments` and `wish_granters` both
 * hang off a wish with `on delete cascade`, so pressing Delete did not remove
 * a wish — it removed the wish, the entire conversation underneath it, and the
 * record of who had offered to help. Lucas removed one by accident and there
 * was nothing to press (Nat, 2026-08-21).
 *
 * It marks the row now (migration 200) and a restrictive read policy hides it
 * from every query in the app at once, so nothing here has to remember a
 * filter. `restoreWishById` brings back the wish and everything under it,
 * because none of it ever went anywhere.
 *
 * The database function does the permission check itself — your own wish, or
 * anyone's if you run the HIVE — so a caller cannot widen it by forgetting to
 * pass `ownerId`.
 */
export async function deleteWishById({
  wishId,
  communityId,
  ownerId,
}: DeleteWishParams): Promise<{ error: Error | null }> {
  if (ownerId) {
    // A screen that believes it is removing one person's wish should not be
    // able to remove somebody else's because a row went stale under it.
    const { data: owned } = await (supabase as any)
      .from('wishes')
      .select('id')
      .eq('id', wishId)
      .eq('community_id', communityId)
      .eq('user_id', ownerId)
      .maybeSingle();

    if (!owned) {
      return { error: new Error('That wish is no longer there to remove.') };
    }
  }

  const { data, error } = await (supabase as any).rpc('soft_delete_wish', { p_wish_id: wishId });

  if (error) {
    return { error };
  }

  if (!data) {
    return { error: new Error('That wish is no longer there to remove.') };
  }

  return { error: null };
}

/** Put it back — the wish, its comments, and its granters, all still there. */
export async function restoreWishById(wishId: string): Promise<{ error: Error | null }> {
  const { data, error } = await (supabase as any).rpc('restore_wish', { p_wish_id: wishId });

  if (error) {
    return { error };
  }

  if (!data) {
    return { error: new Error('That wish could not be brought back.') };
  }

  return { error: null };
}

export type DeletedWish = {
  id: string;
  user_id: string;
  owner_name: string | null;
  title: string | null;
  description: string;
  status: string;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  comment_count: number;
};

/**
 * What is sitting in the bin, for the people allowed to reach into it: your
 * own removed wishes, and every one of them if you run the HIVE.
 *
 * A removed wish is invisible to an ordinary read by design, so this cannot be
 * a normal query — it goes through the same security-definer door as the
 * restore itself.
 */
export async function listDeletedWishes(communityId: string): Promise<{
  wishes: DeletedWish[];
  error: Error | null;
}> {
  const { data, error } = await (supabase as any).rpc('deleted_wishes', {
    p_community_id: communityId,
  });

  if (error) {
    return { wishes: [], error };
  }

  return { wishes: (data ?? []) as DeletedWish[], error: null };
}

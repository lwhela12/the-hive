import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { invalidateWishQueries } from '../queryClient';
import { celebrateWishGranted } from '../celebration';
import type { Wish } from '../../types';

/**
 * Wish reading and the four wish mutations.
 *
 * `loadWishes` is opt-in on purpose. Three of this hook's four call sites —
 * `hive.tsx:2188`, `members.tsx:425`, `profile.tsx:179` — destructure only
 * `grantWish`, but until 2026-08-12 the hook fetched on mount regardless, so
 * every visit to Home, Members and Profile paid for two round trips nothing
 * ever read. Only `monthly-tuneup.tsx` wants the list, and it asks.
 *
 * A second query went with them: a `publicWishes` fetch selecting
 * `user:profiles(*)`. Two foreign keys run from `wishes` to `profiles`
 * (`user_id` and `fulfilled_by`), so the embed was ambiguous and PostgREST
 * had been answering it with a 400 (`PGRST201`) since the day it was
 * written. The hook only checked the data, never the error, so the failure
 * was swallowed in silence — and no screen read `publicWishes` anyway.
 * Home's real public-wish list comes from `useHiveDataQuery`, which is
 * cached and asks for the three profile fields a wish card actually draws.
 *
 * This was another unread query found in this app. An unread query is never free:
 * it costs a round trip, and a broken one hides its own breakage.
 */
export function useWishes({ loadWishes = false }: { loadWishes?: boolean } = {}) {
  const { profile, communityId, communityRole } = useAuth();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(loadWishes);

  const fetchWishes = useCallback(async () => {
    if (!profile || !communityId || !loadWishes) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: userWishes, error } = await supabase
      .from('wishes')
      .select('*')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching wishes:', error);
    if (userWishes) setWishes(userWishes);

    setLoading(false);
  }, [profile?.id, communityId, loadWishes]);

  useEffect(() => {
    fetchWishes();
  }, [fetchWishes]);

  const publishWish = async (wishId: string) => {
    if (!profile || !communityId) {
      return { error: new Error('Not authenticated') };
    }

    const { error } = await supabase
      .from('wishes')
      .update({ status: 'public', is_active: true })
      .eq('id', wishId)
      .eq('user_id', profile.id)
      .eq('community_id', communityId);

    if (!error) {
      await fetchWishes();
      await invalidateWishQueries(communityId, profile.id);
    }

    return { error };
  };

  const fulfillWish = async (wishId: string, fulfilledBy?: string) => {
    if (!profile || !communityId) {
      return { error: new Error('Not authenticated') };
    }

    const { error } = await supabase
      .from('wishes')
      .update({
        status: 'fulfilled',
        is_active: false,
        fulfilled_at: new Date().toISOString(),
        fulfilled_by: fulfilledBy,
      })
      .eq('id', wishId)
      .eq('user_id', profile.id)
      .eq('community_id', communityId);

    if (!error) {
      await fetchWishes();
      await invalidateWishQueries(communityId, profile.id);
    }

    return { error };
  };

  const grantWish = async (
    wishId: string,
    granterIds: string[],
    thankYouMessage?: string,
    wishCommunityId = communityId,
  ) => {
    if (!profile || !wishCommunityId) {
      return { error: new Error('Not authenticated') };
    }

    const fulfilledAt = new Date().toISOString();
    const isAdmin = (wishCommunityId === communityId && communityRole === 'admin') || profile.role === 'admin';

    const { data: wishLink } = await (supabase as any)
      .from('wishes')
      .select('source_board_post_id, user_id')
      .eq('id', wishId)
      .eq('community_id', wishCommunityId)
      .maybeSingle();

    if (!wishLink || (!isAdmin && wishLink.user_id !== profile.id)) {
      return { error: new Error('You can only grant wishes you manage.') };
    }

    // 1. Update wish status and thank you message
    let wishUpdateQuery = supabase
      .from('wishes')
      .update({
        status: 'fulfilled',
        is_active: false,
        is_spotlight: false,
        fulfilled_at: fulfilledAt,
        fulfilled_by: profile.id,
        thank_you_message: thankYouMessage || null,
      })
      .eq('id', wishId)
      .eq('community_id', wishCommunityId);

    if (!isAdmin) {
      wishUpdateQuery = wishUpdateQuery.eq('user_id', profile.id);
    }

    const { error: wishError } = await wishUpdateQuery;

    if (wishError) {
      return { error: wishError };
    }

    // If this wish was turned into a board, completing either side completes the shared dream.
    const { error: boardError } = await (supabase as any)
      .from('board_categories')
      .update({
        status: 'completed',
        completed_at: fulfilledAt,
        completed_by: profile.id,
        completion_note: thankYouMessage || 'Completed from linked wish.',
      })
      .eq('source_wish_id', wishId)
      .eq('community_id', wishCommunityId);

    if (boardError) {
      console.log('Linked board completion skipped (non-blocking):', boardError);
    }

    if (wishLink?.source_board_post_id) {
      const { error: postError } = await (supabase as any)
        .from('board_posts')
        .update({
          status: 'completed',
          completed_at: fulfilledAt,
          completed_by: profile.id,
          completion_note: thankYouMessage || 'Completed from linked wish.',
          granted_wish_id: wishId,
        })
        .eq('id', wishLink.source_board_post_id)
        .eq('community_id', wishCommunityId);

      if (postError) {
        console.log('Linked thread completion skipped (non-blocking):', postError);
      }
    }

    // 2. Insert granters into junction table
    if (granterIds.length > 0) {
      const granterInserts = granterIds.map((granterId) => ({
        wish_id: wishId,
        granter_id: granterId,
        community_id: wishCommunityId,
      }));

      const { error: granterError } = await supabase
        .from('wish_granters')
        .upsert(granterInserts, { onConflict: 'wish_id,granter_id' });

      if (granterError) {
        await fetchWishes();
        await invalidateWishQueries(wishCommunityId, profile.id);
        return { error: granterError };
      }
    }

    await fetchWishes();
    await invalidateWishQueries(wishCommunityId, profile.id);
    celebrateWishGranted();
    return { error: null };
  };

  return {
    wishes,
    loading,
    refresh: fetchWishes,
    publishWish,
    fulfillWish,
    grantWish,
  };
}

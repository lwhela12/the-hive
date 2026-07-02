import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { invalidateWishQueries } from '../queryClient';
import type { Wish, Profile } from '../../types';

export function useWishes() {
  const { profile, communityId, communityRole } = useAuth();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [publicWishes, setPublicWishes] = useState<(Wish & { user: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishes = useCallback(async () => {
    if (!profile || !communityId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch user's wishes
    const { data: userWishes } = await supabase
      .from('wishes')
      .select('*')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .order('created_at', { ascending: false });

    if (userWishes) setWishes(userWishes);

    // Fetch public wishes from others
    const { data: othersWishes } = await supabase
      .from('wishes')
      .select('*, user:profiles(*)')
      .eq('status', 'public')
      .or('is_active.is.true,is_active.is.null')
      .eq('community_id', communityId)
      .neq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (othersWishes) setPublicWishes(othersWishes as (Wish & { user: Profile })[]);

    setLoading(false);
  }, [profile?.id, communityId]);

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
    thankYouMessage?: string
  ) => {
    if (!profile || !communityId) {
      return { error: new Error('Not authenticated') };
    }

    const fulfilledAt = new Date().toISOString();
    const isAdmin = communityRole === 'admin' || profile.role === 'admin';

    const { data: wishLink } = await (supabase as any)
      .from('wishes')
      .select('source_board_post_id, user_id')
      .eq('id', wishId)
      .eq('community_id', communityId)
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
        fulfilled_at: fulfilledAt,
        fulfilled_by: profile.id,
        thank_you_message: thankYouMessage || null,
      })
      .eq('id', wishId)
      .eq('community_id', communityId);

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
      .eq('community_id', communityId);

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
        .eq('community_id', communityId);

      if (postError) {
        console.log('Linked thread completion skipped (non-blocking):', postError);
      }
    }

    // 2. Insert granters into junction table
    if (granterIds.length > 0) {
      const granterInserts = granterIds.map((granterId) => ({
        wish_id: wishId,
        granter_id: granterId,
        community_id: communityId,
      }));

      const { error: granterError } = await supabase
        .from('wish_granters')
        .upsert(granterInserts, { onConflict: 'wish_id,granter_id' });

      if (granterError) {
        await fetchWishes();
        await invalidateWishQueries(communityId, profile.id);
        return { error: granterError };
      }
    }

    await fetchWishes();
    await invalidateWishQueries(communityId, profile.id);
    return { error: null };
  };

  return {
    wishes,
    publicWishes,
    loading,
    refresh: fetchWishes,
    publishWish,
    fulfillWish,
    grantWish,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { Wish, Profile } from '../../types';

export function useWishes() {
  const { profile, communityId } = useAuth();
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
      .eq('is_active', true)
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
    const { error } = await supabase
      .from('wishes')
      .update({ status: 'public', is_active: true })
      .eq('id', wishId)
      .eq('user_id', profile?.id)
      .eq('community_id', communityId);

    if (!error) {
      await fetchWishes();
    }

    return { error };
  };

  const fulfillWish = async (wishId: string, fulfilledBy?: string) => {
    const { error } = await supabase
      .from('wishes')
      .update({
        status: 'fulfilled',
        is_active: false,
        fulfilled_at: new Date().toISOString(),
        fulfilled_by: fulfilledBy,
      })
      .eq('id', wishId)
      .eq('user_id', profile?.id)
      .eq('community_id', communityId);

    if (!error) {
      await fetchWishes();
    }

    return { error };
  };

  return {
    wishes,
    publicWishes,
    loading,
    refresh: fetchWishes,
    publishWish,
    fulfillWish,
  };
}

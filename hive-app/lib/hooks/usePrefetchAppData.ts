import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { Event, Wish, Profile, BoardCategory } from '../../types';

/**
 * Prefetches critical app data after authentication.
 * This makes tab navigation feel instant since data is already cached.
 * Call this once in the root layout after auth completes.
 */
export function usePrefetchAppData(
  communityId: string | null,
  userId: string | null,
  isAuthenticated: boolean
) {
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    // Only prefetch once per session, when authenticated with required IDs
    if (!isAuthenticated || !communityId || !userId || hasPrefetched.current) {
      return;
    }

    hasPrefetched.current = true;

    const today = new Date().toISOString().split('T')[0];

    // Prefetch all critical data in parallel
    // These match the exact queries in useHiveDataQuery, useChatRoomsQuery, useBoardQuery

    // 1. Public wishes for HIVE page
    queryClient.prefetchQuery({
      queryKey: queryKeys.publicWishes(communityId),
      queryFn: async () => {
        const { data } = await supabase
          .from('wishes')
          .select('*, user:profiles!user_id(*)')
          .eq('status', 'public')
          .eq('is_active', true)
          .eq('community_id', communityId)
          .neq('user_id', userId)
          .order('created_at', { ascending: false });
        return (data as (Wish & { user: Profile })[]) || [];
      },
      staleTime: 5 * 60 * 1000,
    });

    // 2. Upcoming events for HIVE page
    queryClient.prefetchQuery({
      queryKey: queryKeys.events(communityId),
      queryFn: async () => {
        const { data } = await supabase
          .from('events')
          .select('*')
          .gte('event_date', today)
          .eq('community_id', communityId)
          .order('event_date', { ascending: true })
          .limit(5);
        return (data as Event[]) || [];
      },
      staleTime: 10 * 60 * 1000,
    });

    // 3. Chat rooms for Messages page
    queryClient.prefetchQuery({
      queryKey: queryKeys.chatRooms(communityId),
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_chat_rooms_with_data', {
          p_community_id: communityId,
          p_user_id: userId,
        });
        if (error) {
          console.warn('Prefetch chat rooms RPC error:', error.message);
          return [];
        }
        return data || [];
      },
      staleTime: 2 * 60 * 1000,
    });

    // 4. Board categories for Board page
    queryClient.prefetchQuery({
      queryKey: queryKeys.boardCategories(communityId),
      queryFn: async () => {
        const { data } = await supabase
          .from('board_categories')
          .select('*')
          .eq('community_id', communityId)
          .or('requires_approval.eq.false,approved_at.not.is.null')
          .order('display_order', { ascending: true });
        return (data as BoardCategory[]) || [];
      },
      staleTime: 10 * 60 * 1000,
    });

    // 5. Honey pot balance for HIVE page
    queryClient.prefetchQuery({
      queryKey: queryKeys.honeyPot(communityId),
      queryFn: async () => {
        const { data } = await supabase
          .from('honey_pot')
          .select('balance')
          .eq('community_id', communityId)
          .single();
        return (data as { balance: number } | null)?.balance || 0;
      },
      staleTime: 10 * 60 * 1000,
    });
  }, [isAuthenticated, communityId, userId, queryClient]);
}

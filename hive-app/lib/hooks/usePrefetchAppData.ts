import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import { fetchHoneyPotBalance } from '../honeyPot';
import { memberRosterQueryOptions } from './useMembersQuery';
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

    // Defer prefetching until after animations and interactions have settled.
    // This prevents the 5 parallel Supabase requests from competing with the
    // initial render and drawer animation on cold start.
    const task = InteractionManager.runAfterInteractions(() => {
    // Prefetch all critical data in parallel
    // These match the exact queries in useHiveDataQuery, useChatRoomsQuery, useBoardQuery

    // 0. The member roster — for BOTH doors.
    //
    // Landing at HIVE-Wide and tapping Members is the most walked path in the
    // app, and it was the one thing this list did not warm, so it always paid a
    // full round trip that could have been spent while she read the landing
    // page. Both keys are warmed because HIVE-Wide and your own HIVE ask
    // different questions of the same table and cache separately.
    //
    // `scopeIds` at HIVE-Wide is every HIVE you belong to; here we only know the
    // one you are standing in, which is exactly right for the second key and a
    // safe subset for the first — a wider roster still resolves in ~150ms and
    // this only ever removes waiting.
    queryClient.prefetchQuery({
      ...memberRosterQueryOptions([communityId], false),
      staleTime: 2 * 60 * 1000,
    });
    queryClient.prefetchQuery({
      ...memberRosterQueryOptions([communityId], true),
      staleTime: 2 * 60 * 1000,
    });

    // 1. Public wishes for HIVE page
    queryClient.prefetchQuery({
      queryKey: queryKeys.publicWishes(communityId),
      queryFn: async () => {
        const { data } = await supabase
          .from('wishes')
          // Narrowed to the 3 fields WishCard/WishDetail actually read — this
          // used to ship every profile column (bio, hometown, 3MIQ answers)
          // per wish author on every cold load. Matches useHiveDataQuery.ts's
          // identical fix, 2026-08-11.
          .select('*, user:profiles!user_id(id, name, avatar_url)')
          .eq('status', 'public')
          .or('is_active.is.true,is_active.is.null')
          .eq('community_id', communityId)
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
          .or('status.is.null,status.eq.scheduled')
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
        // Transform to match useChatRoomsQuery structure (room_id -> id, etc.)
        //
        // This writes into the SAME cache key as `useChatRoomsQuery`, so it is
        // the first version of a room the Messages screen ever sees. It used to
        // drop `reach` and all five `custom_*` fields, which meant the screen
        // opened on rooms that were missing the very things it decides with:
        // the HIVE-Wide room arrived with no reach and was drawn a second time
        // wearing OG HIVE's name, and anyone who had renamed a room for
        // themselves saw it snap from the default name to theirs a beat later.
        //
        // Two mappings of one shape will drift again. If a third appears, make
        // it one exported function instead.
        return (data || []).map((row: any) => ({
          id: row.room_id,
          community_id: row.room_community_id,
          room_type: row.room_type,
          name: row.room_name ?? undefined,
          description: row.room_description ?? undefined,
          created_by: row.room_created_by ?? undefined,
          created_at: row.room_created_at,
          reach: row.room_reach ?? undefined,
          custom_title: row.custom_title ?? undefined,
          custom_emoji: row.custom_emoji ?? undefined,
          custom_image_url: row.custom_image_url ?? undefined,
          custom_background: row.custom_background ?? undefined,
          custom_background_image_url: row.custom_background_image_url ?? undefined,
          members: row.members || [],
          last_message: row.last_message ?? undefined,
          unread_count: Number(row.unread_count),
        }));
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
      queryFn: () => fetchHoneyPotBalance(communityId),
      staleTime: 60 * 1000,
    });
    }); // end InteractionManager.runAfterInteractions

    return () => task.cancel();
  }, [isAuthenticated, communityId, userId, queryClient]);
}

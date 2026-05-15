import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { Profile, Wish, WishGranter } from '../../types';

export type LinkedWish = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter?: Profile })[];
};

async function fetchBoardLinkedWishes(
  communityId: string,
  categoryId: string
): Promise<LinkedWish[]> {
  const { data, error } = await supabase
    .from('wishes')
    .select('*, user:profiles!user_id(*), granters:wish_granters(*, granter:profiles!granter_id(*))')
    .eq('community_id', communityId)
    .eq('board_category_id', categoryId)
    .order('status', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (String(error.message ?? '').includes('board_category_id')) {
      return [];
    }
    console.error('Error fetching board linked wishes:', error);
    throw error;
  }

  return (data as LinkedWish[]) || [];
}

export function useBoardLinkedWishes(communityId?: string, categoryId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.boardLinkedWishes(communityId || '', categoryId || ''),
    queryFn: () => fetchBoardLinkedWishes(communityId!, categoryId!),
    enabled: !!communityId && !!categoryId,
    staleTime: 2 * 60 * 1000,
  });

  const invalidateLinkedWishes = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.boardLinkedWishes(communityId || '', categoryId || ''),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.publicWishes(communityId || ''),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.grantedWishes(communityId || ''),
    });
  }, [categoryId, communityId, queryClient]);

  return {
    wishes: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    invalidateLinkedWishes,
  };
}

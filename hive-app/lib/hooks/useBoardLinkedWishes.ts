import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { Profile, Wish, WishGranter, WishStatus } from '../../types';

export type LinkedWish = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter?: Profile })[];
};

// A linked wish only ever opens into WishDetail (components/hive/WishDetail.tsx),
// which reads `wish.user` and `granters[].granter` for an avatar + name each
// (owner card header, "Granted by" chips) — never bio, hometown, or any of
// the "3 most interesting questions" fields. Narrowed 2026-08-11, same fix
// as lib/hooks/useHiveDataQuery.ts and usePrefetchAppData.ts.
const linkedWishSelect = '*, user:profiles!user_id(id, name, avatar_url), granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))';
const sharedLinkedWishStatuses: WishStatus[] = ['public', 'fulfilled'];

function sortLinkedWishes(wishes: LinkedWish[]) {
  return wishes.sort((a, b) => {
    const aGranted = a.status === 'fulfilled';
    const bGranted = b.status === 'fulfilled';
    if (aGranted && !bGranted) return 1;
    if (!aGranted && bGranted) return -1;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

async function fetchBoardLinkedWishes(
  communityId: string,
  categoryId: string
): Promise<LinkedWish[]> {
  const linkedByBoardQuery = supabase
    .from('wishes')
    .select(linkedWishSelect)
    .eq('community_id', communityId)
    .eq('board_category_id', categoryId)
    .in('status', sharedLinkedWishStatuses);

  const [linkedByBoard, categoryResult, postsResult] = await Promise.all([
    linkedByBoardQuery,
    (supabase as any)
      .from('board_categories')
      .select('source_wish_id')
      .eq('community_id', communityId)
      .eq('id', categoryId)
      .maybeSingle(),
    supabase
      .from('board_posts')
      .select('id')
      .eq('community_id', communityId)
      .eq('category_id', categoryId),
  ]);

  if (linkedByBoard.error) {
    const error = linkedByBoard.error;
    if (String(error.message ?? '').includes('board_category_id')) {
      return [];
    }
    console.error('Error fetching board linked wishes:', error);
    throw error;
  }

  if (categoryResult.error) {
    console.warn('Error fetching board source wish:', categoryResult.error);
  }

  if (postsResult.error) {
    console.warn('Error fetching board thread wish links:', postsResult.error);
  }

  const sourceWishId = categoryResult.data?.source_wish_id;
  const postIds = (postsResult.data ?? [])
    .map((post: { id?: string | null }) => post.id)
    .filter((id: string | null | undefined): id is string => !!id);
  const extraQueries: PromiseLike<{ data: unknown[] | null; error: unknown }>[] = [];

  if (sourceWishId) {
    extraQueries.push(
      supabase
        .from('wishes')
        .select(linkedWishSelect)
        .eq('community_id', communityId)
        .eq('id', sourceWishId)
        .in('status', sharedLinkedWishStatuses)
    );
  }

  if (postIds.length > 0) {
    extraQueries.push(
      supabase
        .from('wishes')
        .select(linkedWishSelect)
        .eq('community_id', communityId)
        .in('source_board_post_id', postIds)
        .in('status', sharedLinkedWishStatuses)
    );
  }

  const extraResults = await Promise.all(extraQueries);
  const byId = new Map<string, LinkedWish>();
  ((linkedByBoard.data as LinkedWish[]) || []).forEach((wish) => byId.set(wish.id, wish));

  extraResults.forEach((result) => {
    if (result.error) {
      console.warn('Error fetching extra board wish links:', result.error);
      return;
    }

    ((result.data as LinkedWish[]) || []).forEach((wish) => byId.set(wish.id, wish));
  });

  return sortLinkedWishes(Array.from(byId.values()));
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

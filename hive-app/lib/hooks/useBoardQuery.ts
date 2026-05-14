import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { BoardCategory, BoardPost, BoardReaction, Profile } from '../../types';

export type PostWithAuthor = BoardPost & { author?: Profile; reactions?: BoardReaction[] };

async function fetchCategories(communityId: string): Promise<BoardCategory[]> {
  const { data, error } = await supabase
    .from('board_categories')
    .select('*, member_tags:board_category_member_tags(*, member:profiles!board_category_member_tags_tagged_user_id_fkey(id, name, avatar_url))')
    .eq('community_id', communityId)
    .or('requires_approval.eq.false,approved_at.not.is.null')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }

  return data || [];
}

interface CategoryStats {
  count: number;
  latestActivity: string | null; // ISO timestamp of most recent activity
}

async function fetchPostCounts(communityId: string): Promise<Record<string, CategoryStats>> {
  const { data, error } = await supabase
    .from('board_posts')
    .select('category_id, created_at, last_reply_at')
    .eq('community_id', communityId);

  if (error) {
    console.error('Error fetching post counts:', error);
    throw error;
  }

  const stats: Record<string, CategoryStats> = {};
  (data || []).forEach((row: { category_id: string; created_at: string; last_reply_at?: string | null }) => {
    if (!stats[row.category_id]) {
      stats[row.category_id] = { count: 0, latestActivity: null };
    }
    stats[row.category_id].count += 1;
    // Track latest activity (most recent of created_at or last_reply_at)
    const activity = row.last_reply_at || row.created_at;
    if (!stats[row.category_id].latestActivity || activity > stats[row.category_id].latestActivity!) {
      stats[row.category_id].latestActivity = activity;
    }
  });
  return stats;
}

async function fetchPosts(
  communityId: string,
  categoryId: string
): Promise<PostWithAuthor[]> {
  // Join reactions in the same query to avoid a sequential round-trip
  const { data, error } = await supabase
    .from('board_posts')
    .select('*, author:profiles!board_posts_author_id_fkey(*), reactions:board_reactions(*)')
    .eq('community_id', communityId)
    .eq('category_id', categoryId)
    .limit(50);

  if (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }

  const posts = (data as PostWithAuthor[]) || [];

  // Sort client-side: pinned first, then by most recent activity (reply or creation)
  posts.sort((a, b) => {
    // Pinned posts always first
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;

    // Sort by most recent activity: last_reply_at or created_at, whichever is later
    const aActivity = a.last_reply_at || a.created_at;
    const bActivity = b.last_reply_at || b.created_at;
    return bActivity.localeCompare(aActivity);
  });

  return posts;
}


export function useBoardPostCountsQuery(communityId?: string) {
  return useQuery({
    queryKey: queryKeys.boardPostCounts(communityId || ''),
    queryFn: () => fetchPostCounts(communityId!),
    enabled: !!communityId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBoardCategoriesQuery(communityId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.boardCategories(communityId || ''),
    queryFn: () => fetchCategories(communityId!),
    enabled: !!communityId,
    // Categories rarely change, cache for 10 minutes
    staleTime: 10 * 60 * 1000,
  });

  // Invalidate categories cache (e.g., after creating a new category)
  const invalidateCategories = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.boardCategories(communityId || ''),
    });
  }, [communityId, queryClient]);

  return {
    ...query,
    invalidateCategories,
  };
}

export function useBoardPostsQuery(communityId?: string, categoryId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.boardPosts(communityId || '', categoryId || ''),
    queryFn: () => fetchPosts(communityId!, categoryId!),
    enabled: !!communityId && !!categoryId,
    // Posts change more frequently, 2 minute stale time
    staleTime: 2 * 60 * 1000,
  });

  // Optimistically add a new post to the cache
  const addPostToCache = useCallback(
    (post: PostWithAuthor) => {
      queryClient.setQueryData<PostWithAuthor[]>(
        queryKeys.boardPosts(communityId || '', categoryId || ''),
        (old) => {
          if (!old) return [post];
          // Add to top (after pinned posts)
          const pinnedPosts = old.filter((p) => p.is_pinned);
          const regularPosts = old.filter((p) => !p.is_pinned);
          return [...pinnedPosts, post, ...regularPosts];
        }
      );
    },
    [communityId, categoryId, queryClient]
  );

  // Invalidate posts cache (e.g., after creating a post)
  const invalidatePosts = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.boardPosts(communityId || '', categoryId || ''),
    });
  }, [communityId, categoryId, queryClient]);

  return {
    posts: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addPostToCache,
    invalidatePosts,
  };
}

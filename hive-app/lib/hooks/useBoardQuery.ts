import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { BoardCategory, BoardPost, BoardReaction, Profile } from '../../types';

export type PostWithAuthor = BoardPost & { author?: Profile; reactions?: BoardReaction[] };

async function fetchCategories(communityId: string): Promise<BoardCategory[]> {
  const { data, error } = await supabase
    .from('board_categories')
    .select('*')
    .eq('community_id', communityId)
    .or('requires_approval.eq.false,approved_at.not.is.null')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }

  return data || [];
}

async function fetchPosts(
  communityId: string,
  categoryId: string
): Promise<PostWithAuthor[]> {
  const { data, error } = await supabase
    .from('board_posts')
    .select('*, author:profiles!board_posts_author_id_fkey(*)')
    .eq('community_id', communityId)
    .eq('category_id', categoryId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }

  const posts = (data as PostWithAuthor[]) || [];

  // Fetch reactions for all posts in one query
  if (posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const { data: reactions } = await supabase
      .from('board_reactions')
      .select('*')
      .in('post_id', postIds);

    // Attach reactions to their respective posts
    if (reactions) {
      posts.forEach((post) => {
        post.reactions = reactions.filter((r) => r.post_id === post.id);
      });
    }
  }

  return posts;
}

export function useBoardCategoriesQuery(communityId?: string) {
  return useQuery({
    queryKey: queryKeys.boardCategories(communityId || ''),
    queryFn: () => fetchCategories(communityId!),
    enabled: !!communityId,
    // Categories rarely change, cache for 10 minutes
    staleTime: 10 * 60 * 1000,
  });
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

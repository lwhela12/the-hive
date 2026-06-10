import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { BoardCategory, BoardPost, BoardReaction, BoardReply, Profile } from '../../types';

export type PostWithAuthor = BoardPost & { author?: Profile; reactions?: BoardReaction[] };
export type BoardSearchReplyMatch = Pick<BoardReply, 'id' | 'post_id' | 'content' | 'created_at'> & {
  author?: Pick<Profile, 'name'> | null;
};
export type BoardSearchThreadMatch = Pick<
  BoardPost,
  'id' | 'category_id' | 'title' | 'content' | 'archived_at' | 'created_at' | 'last_reply_at'
> & {
  author?: Pick<Profile, 'name'> | null;
  replies: BoardSearchReplyMatch[];
};
export type BoardSearchIndex = Record<string, BoardSearchThreadMatch[]>;
type BoardSearchPostRow = Omit<BoardSearchThreadMatch, 'replies'>;

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
    .select('id, category_id, created_at, last_reply_at')
    .eq('community_id', communityId);

  if (error) {
    console.error('Error fetching post counts:', error);
    throw error;
  }

  const stats: Record<string, CategoryStats> = {};
  const postCategoryById = new Map<string, string>();
  (data || []).forEach((row: { id: string; category_id: string; created_at: string; last_reply_at?: string | null }) => {
    postCategoryById.set(row.id, row.category_id);
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

  const { data: replies, error: repliesError } = await supabase
    .from('board_replies')
    .select('post_id, created_at')
    .eq('community_id', communityId);

  if (repliesError) {
    console.warn('Error fetching board reply activity:', repliesError);
  } else {
    (replies || []).forEach((reply: { post_id: string; created_at: string }) => {
      const categoryId = postCategoryById.get(reply.post_id);
      if (!categoryId) return;
      if (!stats[categoryId]) {
        stats[categoryId] = { count: 0, latestActivity: null };
      }
      if (!stats[categoryId].latestActivity || reply.created_at > stats[categoryId].latestActivity!) {
        stats[categoryId].latestActivity = reply.created_at;
      }
    });
  }

  return stats;
}

async function fetchBoardSearchIndex(communityId: string): Promise<BoardSearchIndex> {
  const { data, error } = await supabase
    .from('board_posts')
    .select('id, category_id, title, content, archived_at, created_at, last_reply_at, author:profiles!board_posts_author_id_fkey(name)')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching board search index:', error);
    throw error;
  }

  const posts = ((data || []) as unknown as BoardSearchPostRow[]);
  const postIds = posts.map((post) => post.id);
  const repliesByPost = new Map<string, BoardSearchReplyMatch[]>();

  if (postIds.length > 0) {
    const { data: replies, error: repliesError } = await supabase
      .from('board_replies')
      .select('id, post_id, content, created_at, author:profiles!board_replies_author_id_fkey(name)')
      .eq('community_id', communityId)
      .in('post_id', postIds)
      .order('created_at', { ascending: false });

    if (repliesError) {
      console.warn('Error fetching board search replies:', repliesError);
    } else {
      (((replies || []) as unknown as BoardSearchReplyMatch[])).forEach((reply) => {
        const existing = repliesByPost.get(reply.post_id) || [];
        existing.push(reply);
        repliesByPost.set(reply.post_id, existing);
      });
    }
  }

  return posts.reduce<BoardSearchIndex>((index, post) => {
    const thread = {
      ...post,
      replies: repliesByPost.get(post.id) || [],
    };
    const existing = index[post.category_id] || [];
    existing.push(thread);
    index[post.category_id] = existing;
    return index;
  }, {});
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
  const latestReplyByPost = new Map<string, string>();
  const postIds = posts.map((post) => post.id);

  if (postIds.length > 0) {
    const { data: replies, error: repliesError } = await supabase
      .from('board_replies')
      .select('post_id, created_at')
      .in('post_id', postIds);

    if (repliesError) {
      console.warn('Error fetching board thread activity:', repliesError);
    } else {
      (replies || []).forEach((reply: { post_id: string; created_at: string }) => {
        const current = latestReplyByPost.get(reply.post_id);
        if (!current || reply.created_at > current) {
          latestReplyByPost.set(reply.post_id, reply.created_at);
        }
      });
    }
  }

  const getPostActivity = (post: PostWithAuthor) => {
    const activity = post.last_reply_at || post.created_at;
    const replyActivity = latestReplyByPost.get(post.id);
    return replyActivity && replyActivity > activity ? replyActivity : activity;
  };

  // Sort client-side: pinned first, then by most recent activity (reply or creation)
  posts.sort((a, b) => {
    const aArchived = !!a.archived_at;
    const bArchived = !!b.archived_at;
    if (aArchived && !bArchived) return 1;
    if (!aArchived && bArchived) return -1;

    const aCompleted = a.status === 'completed';
    const bCompleted = b.status === 'completed';
    if (aCompleted && !bCompleted) return 1;
    if (!aCompleted && bCompleted) return -1;

    // Pinned posts always first
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;

    // Sort by most recent activity: last_reply_at or created_at, whichever is later
    const aActivity = getPostActivity(a);
    const bActivity = getPostActivity(b);
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

export function useBoardSearchIndexQuery(communityId?: string) {
  return useQuery({
    queryKey: queryKeys.boardSearchIndex(communityId || ''),
    queryFn: () => fetchBoardSearchIndex(communityId!),
    enabled: !!communityId,
    staleTime: 2 * 60 * 1000,
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

  const updatePostInCache = useCallback(
    (postId: string, updates: Partial<PostWithAuthor>) => {
      queryClient.setQueryData<PostWithAuthor[]>(
        queryKeys.boardPosts(communityId || '', categoryId || ''),
        (old) => old?.map((post) => (post.id === postId ? { ...post, ...updates } : post)) ?? old
      );
    },
    [communityId, categoryId, queryClient]
  );

  // Invalidate posts cache (e.g., after creating a post)
  const invalidatePosts = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.boardPosts(communityId || '', categoryId || ''),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.boardSearchIndex(communityId || ''),
    });
  }, [communityId, categoryId, queryClient]);

  return {
    posts: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addPostToCache,
    updatePostInCache,
    invalidatePosts,
  };
}

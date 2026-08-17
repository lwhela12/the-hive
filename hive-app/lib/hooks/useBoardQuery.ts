import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import { attachReactionUsers } from '../reactionUsers';
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

/**
 * Which set of boards a screen is asking for.
 *
 * 'hive'      — the ones belonging to the HIVE you are standing in.
 * 'all_hives' — the shared ones on HIVE-Wide, whichever HIVE happens to own
 *               the row. They all live under OG because that is where their
 *               posts were written, so this deliberately does NOT filter by
 *               community; row-level security decides who may read them.
 */
export type BoardReach = 'hive' | 'all_hives';

// Exported for usePrefetchAppData, which warms the same cache key at launch —
// it used to carry its own hand-rolled copy of this query, and when this one
// learned to include the shared HIVE-Wide boards (2026-08-11) the copy didn't,
// so the prefetched cache quietly served the old answer for its whole
// staleTime. Nat found it on her phone: Tech HIVE's Boards was missing the
// HIVE-Wide board that the fixed query returns. One function, one truth.
export async function fetchCategories(communityId: string | undefined, reach: BoardReach): Promise<BoardCategory[]> {
  let q = supabase
    .from('board_categories')
    .select('*, member_tags:board_category_member_tags(*, member:profiles!board_category_member_tags_tagged_user_id_fkey(id, name, avatar_url))');

  if (reach === 'all_hives') {
    // The shared boards, scoped by reach rather than by community, so that a
    // Tech member sees them even though OG owns the rows (Nat 2026-08-03).
    q = q.eq('reach', 'all_hives');
  } else {
    // This HIVE's own boards PLUS the shared HIVE-Wide ones. The shared boards
    // used to live only behind HIVE-Wide's door (the 2026-08-03 split of
    // "what's ours" and "what's everybody's") — Nat reversed that on
    // 2026-08-11 when the shared board vanished from OG's Boards page:
    // "since it is HIVE wide, it should also populate in our boards view."
    // The card's badge says which kind each one is, so the mixed list stays
    // readable in a way the pre-split single list wasn't.
    q = q.or(`and(community_id.eq.${communityId ?? ''},reach.eq.hive),reach.eq.all_hives`);
  }

  const { data, error } = await q
    // The newsletter board keeps every issue of The Buzz, so it stays in the
    // database — it just stops being a board you browse. The Buzz has its own
    // door under HIVE-Wide and that is the only one.
    .neq('topic_kind', 'newsletter')
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
  /** Freshest threads — the bulletin-card grid shows these as tappable micro previews. */
  recentThreads?: { id: string; title: string }[];
}

async function fetchPostCounts(communityId: string): Promise<Record<string, CategoryStats>> {
  const { data, error } = await supabase
    .from('board_posts')
    // `archived_at`, and only `archived_at`.
    //
    // Nat, 2026-08-17, after seven threads were archived: *"if I look at the
    // board's view on the things we learned list, there are three different
    // bullets that look like there are threads there, but then when you click
    // on it, it says no threads."* The card counted and previewed archived
    // threads while the board itself, which filters properly, showed none.
    //
    // The preview filter below said `status !== 'archived'` — and `status`
    // only ever holds 'active' or 'completed', so that test could never be
    // true. `buzz.tsx` had the identical bug and it is written up in
    // CLAUDE.md; this is the second place it was hiding.
    .select('id, category_id, title, status, created_at, last_reply_at')
    .eq('community_id', communityId)
    .is('archived_at', null);

  if (error) {
    console.error('Error fetching post counts:', error);
    throw error;
  }

  const stats: Record<string, CategoryStats> = {};
  const postCategoryById = new Map<string, string>();
  const previewCandidates: Record<string, { id: string; title: string; activity: string }[]> = {};
  (data || []).forEach((row: { id: string; category_id: string; title?: string | null; status?: string | null; created_at: string; last_reply_at?: string | null }) => {
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
    if (row.title) {
      (previewCandidates[row.category_id] ??= []).push({ id: row.id, title: row.title, activity });
    }
  });
  Object.entries(previewCandidates).forEach(([categoryId, candidates]) => {
    stats[categoryId].recentThreads = candidates
      .sort((a, b) => b.activity.localeCompare(a.activity))
      .slice(0, 15)
      .map((candidate) => ({ id: candidate.id, title: candidate.title }));
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
  // BoardPostCard (the list this feeds) only ever reads id/name/avatar_url
  // off `author` — narrowed 2026-08-11, same fix as lib/hooks/useHiveDataQuery.ts.
  const { data, error } = await supabase
    .from('board_posts')
    .select('*, author:profiles!board_posts_author_id_fkey(id, name, avatar_url), reactions:board_reactions(*)')
    .eq('community_id', communityId)
    .eq('category_id', categoryId)
    .limit(50);

  if (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }

  const posts = (data as unknown as PostWithAuthor[]) || [];
  const reactionsWithUsers = await attachReactionUsers(
    posts.flatMap((post) => post.reactions ?? []) as BoardReaction[]
  );
  const reactionsById = new Map(reactionsWithUsers.map((reaction) => [reaction.id, reaction]));
  posts.forEach((post) => {
    post.reactions = (post.reactions ?? []).map((reaction) => reactionsById.get(reaction.id) ?? reaction);
  });

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

    // Anchored threads (standing references like "HIVE Help Ideas") sink to
    // the bottom so monthly threads read as an uninterrupted timeline.
    if (a.is_anchored && !b.is_anchored) return 1;
    if (!a.is_anchored && b.is_anchored) return -1;

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

export function useBoardCategoriesQuery(communityId?: string, reach: BoardReach = 'hive') {
  const queryClient = useQueryClient();
  // The shared boards are the same set for everybody, so they get one cache
  // entry rather than one per HIVE you happen to be standing in.
  const cacheKey = reach === 'all_hives' ? 'all_hives' : (communityId || '');

  const query = useQuery({
    queryKey: queryKeys.boardCategories(cacheKey),
    queryFn: () => fetchCategories(communityId, reach),
    // HIVE-Wide does not need a community to ask about — that is the point of it.
    enabled: reach === 'all_hives' || !!communityId,
    // Categories rarely change, cache for 10 minutes
    staleTime: 10 * 60 * 1000,
  });

  // Invalidate categories cache (e.g., after creating a new category)
  const invalidateCategories = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.boardCategories(cacheKey),
    });
  }, [cacheKey, queryClient]);

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

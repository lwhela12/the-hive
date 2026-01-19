import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../supabase';
import type { RoomMessage, Profile, MessageReaction } from '../../types';

export type MessageWithData = RoomMessage & {
  sender?: Profile;
  reactions?: MessageReaction[];
};

const MESSAGES_PER_PAGE = 20;

// Fetch messages with reactions in a single optimized query
async function fetchMessagesPage(
  roomId: string,
  cursor?: string, // created_at of oldest message for pagination
  limit: number = MESSAGES_PER_PAGE
): Promise<{ messages: MessageWithData[]; hasMore: boolean; oldestCursor?: string }> {
  // Join reactions and only select needed profile fields for better performance
  let query = supabase
    .from('room_messages')
    .select(`
      *,
      sender:profiles(id, name, avatar_url),
      reactions:message_reactions(id, message_id, user_id, emoji, created_at)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false }) // Fetch newest first for pagination
    .limit(limit + 1); // Fetch one extra to check if there's more

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('Error fetching messages:', error);
    return { messages: [], hasMore: false };
  }

  const hasMore = data.length > limit;
  const messages = hasMore ? data.slice(0, limit) : data;

  if (messages.length > 0) {
    // Reverse to get chronological order (oldest first for display)
    return {
      messages: messages.reverse() as MessageWithData[],
      hasMore,
      oldestCursor: messages[messages.length - 1]?.created_at,
    };
  }

  return { messages: [], hasMore: false };
}

// Add query key for room messages
export const roomMessagesKey = (roomId: string) => ['roomMessages', roomId] as const;

/**
 * Hook to fetch room messages with React Query and pagination support.
 * Initially loads recent messages, can load older messages on demand.
 */
export function useRoomMessagesQuery(roomId: string) {
  // Use infinite query for pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: roomMessagesKey(roomId),
    queryFn: ({ pageParam }) => fetchMessagesPage(roomId, pageParam, MESSAGES_PER_PAGE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.oldestCursor : undefined),
    enabled: !!roomId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Flatten all pages into a single messages array (chronological order)
  const messages: MessageWithData[] = data?.pages
    ? data.pages.flatMap((page) => page.messages).sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    : [];

  // Note: Realtime subscription is handled in RoomChatView component
  // to be in the same channel as typing indicators (which works reliably)

  // Function to load older messages
  const loadOlderMessages = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    messages,
    loading: isLoading,
    loadingOlder: isFetchingNextPage,
    hasOlderMessages: hasNextPage ?? false,
    loadOlderMessages,
    refetch,
  };
}

/**
 * Prefetch recent messages for a room.
 * Used to preload messages for rooms the user is likely to click.
 */
export async function prefetchRoomMessages(
  queryClient: ReturnType<typeof useQueryClient>,
  roomId: string | undefined
) {
  // Guard against undefined roomId to prevent API errors
  if (!roomId) {
    console.warn('prefetchRoomMessages called with undefined roomId, skipping');
    return;
  }

  await queryClient.prefetchInfiniteQuery({
    queryKey: roomMessagesKey(roomId),
    queryFn: () => fetchMessagesPage(roomId, undefined, MESSAGES_PER_PAGE),
    initialPageParam: undefined,
    staleTime: 2 * 60 * 1000,
  });
}

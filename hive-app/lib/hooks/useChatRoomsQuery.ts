import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { ChatRoom, Profile, RoomMessage, ChatRoomMember } from '../../types';

export type RoomWithData = ChatRoom & {
  members?: Array<ChatRoomMember & { user?: Profile }>;
  last_message?: RoomMessage & { sender?: Profile };
  unread_count?: number;
};

interface RpcChatRoomRow {
  room_id: string;
  room_community_id: string;
  room_type: 'community' | 'dm' | 'group_dm';
  room_name: string | null;
  room_description: string | null;
  room_created_by: string | null;
  room_created_at: string;
  members: Array<ChatRoomMember & { user?: Profile }>;
  last_message: (RoomMessage & { sender?: Profile }) | null;
  unread_count: number;
}

async function fetchChatRooms(
  communityId: string,
  userId: string
): Promise<RoomWithData[]> {
  // Try the optimized RPC function (single query instead of N+1)
  const { data, error } = await supabase.rpc('get_chat_rooms_with_data', {
    p_community_id: communityId,
    p_user_id: userId,
  });

  if (error) {
    // Fall back to manual queries if RPC fails
    console.warn('RPC error, using fallback:', error.message);
    return fetchChatRoomsFallback(communityId, userId);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Transform the RPC response to match RoomWithData type
  return (data as RpcChatRoomRow[]).map((row) => ({
    id: row.room_id,
    community_id: row.room_community_id,
    room_type: row.room_type,
    name: row.room_name ?? undefined,
    description: row.room_description ?? undefined,
    created_by: row.room_created_by ?? undefined,
    created_at: row.room_created_at,
    members: row.members || [],
    last_message: row.last_message ?? undefined,
    unread_count: Number(row.unread_count),
  }));
}

// Fallback for when RPC has issues - uses original N+1 pattern
async function fetchChatRoomsFallback(
  communityId: string,
  userId: string
): Promise<RoomWithData[]> {
  // Fetch community rooms
  const { data: communityRooms } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('community_id', communityId)
    .eq('room_type', 'community');

  // Fetch DM rooms the user is a member of
  const { data: memberRooms } = await supabase
    .from('chat_room_members')
    .select('room:chat_rooms(*)')
    .eq('user_id', userId);

  // Combine and deduplicate rooms
  const allRooms: ChatRoom[] = [
    ...(communityRooms || []),
    ...((memberRooms || [])
      .map((m) => m.room as ChatRoom)
      .filter((r) => r && (r.room_type === 'dm' || r.room_type === 'group_dm'))),
  ];

  const uniqueRooms = Array.from(
    new Map(allRooms.map((r) => [r.id, r])).values()
  );

  // Fetch additional data for each room (original N+1 pattern)
  const roomsWithData: RoomWithData[] = await Promise.all(
    uniqueRooms.map(async (room) => {
      // Get members for DM and group_dm rooms
      let members: Array<ChatRoomMember & { user?: Profile }> = [];
      if (room.room_type === 'dm' || room.room_type === 'group_dm') {
        const { data: memberData } = await supabase
          .from('chat_room_members')
          .select('*, user:profiles(*)')
          .eq('room_id', room.id);
        members = (memberData || []) as Array<ChatRoomMember & { user?: Profile }>;
      }

      // Get last message
      const { data: lastMsgData } = await supabase
        .from('room_messages')
        .select('*, sender:profiles(*)')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get unread count
      const { data: membershipData } = await supabase
        .from('chat_room_members')
        .select('last_read_at')
        .eq('room_id', room.id)
        .eq('user_id', userId)
        .maybeSingle();

      let unreadCount = 0;
      if (membershipData?.last_read_at) {
        const { count } = await supabase
          .from('room_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .gt('created_at', membershipData.last_read_at)
          .neq('sender_id', userId);
        unreadCount = count || 0;
      }

      return {
        ...room,
        members,
        last_message: lastMsgData as (RoomMessage & { sender?: Profile }) | undefined,
        unread_count: unreadCount,
      };
    })
  );

  // Sort: community rooms first, then by last message time
  roomsWithData.sort((a, b) => {
    if (a.room_type === 'community' && b.room_type !== 'community') return -1;
    if (a.room_type !== 'community' && b.room_type === 'community') return 1;

    const aTime = a.last_message?.created_at || a.created_at;
    const bTime = b.last_message?.created_at || b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return roomsWithData;
}

export function useChatRoomsQuery(communityId?: string, userId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.chatRooms(communityId || ''),
    queryFn: () => fetchChatRooms(communityId!, userId!),
    enabled: !!communityId && !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes for chat rooms
  });

  // Optimistically update room's last message and unread count
  const updateRoomLastMessage = useCallback(
    (roomId: string, message: RoomMessage & { sender?: Profile }) => {
      queryClient.setQueryData<RoomWithData[]>(
        queryKeys.chatRooms(communityId || ''),
        (old) => {
          if (!old) return old;
          return old
            .map((room) =>
              room.id === roomId
                ? {
                    ...room,
                    last_message: message,
                    unread_count: (room.unread_count || 0) + 1,
                  }
                : room
            )
            .sort((a, b) => {
              // Keep community rooms first
              if (a.room_type === 'community' && b.room_type !== 'community')
                return -1;
              if (a.room_type !== 'community' && b.room_type === 'community')
                return 1;

              const aTime = a.last_message?.created_at || a.created_at;
              const bTime = b.last_message?.created_at || b.created_at;
              return new Date(bTime).getTime() - new Date(aTime).getTime();
            });
        }
      );
    },
    [communityId, queryClient]
  );

  // Mark room as read (reset unread count)
  const markRoomAsRead = useCallback(
    (roomId: string) => {
      queryClient.setQueryData<RoomWithData[]>(
        queryKeys.chatRooms(communityId || ''),
        (old) => {
          if (!old) return old;
          return old.map((room) =>
            room.id === roomId ? { ...room, unread_count: 0 } : room
          );
        }
      );
    },
    [communityId, queryClient]
  );

  // Subscribe to realtime changes with targeted updates
  useEffect(() => {
    if (!communityId || !userId) return;

    const channel = supabase
      .channel('chat-rooms-optimized')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
        },
        async (payload) => {
          const newMessage = payload.new as RoomMessage;

          // Only process messages for rooms in this community
          if (newMessage.community_id !== communityId) return;

          // If message is from current user, skip (handled optimistically)
          if (newMessage.sender_id === userId) return;

          // Fetch just the sender profile
          const { data: sender } = await supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .eq('id', newMessage.sender_id)
            .single();

          // Update cache directly without full refetch
          queryClient.setQueryData<RoomWithData[]>(
            queryKeys.chatRooms(communityId),
            (old) => {
              if (!old) return old;
              return old
                .map((room) =>
                  room.id === newMessage.room_id
                    ? {
                        ...room,
                        last_message: { ...newMessage, sender: sender || undefined },
                        unread_count: (room.unread_count || 0) + 1,
                      }
                    : room
                )
                .sort((a, b) => {
                  // Keep community rooms first
                  if (
                    a.room_type === 'community' &&
                    b.room_type !== 'community'
                  )
                    return -1;
                  if (
                    a.room_type !== 'community' &&
                    b.room_type === 'community'
                  )
                    return 1;

                  const aTime = a.last_message?.created_at || a.created_at;
                  const bTime = b.last_message?.created_at || b.created_at;
                  return new Date(bTime).getTime() - new Date(aTime).getTime();
                });
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId, userId, queryClient]);

  return {
    rooms: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateRoomLastMessage,
    markRoomAsRead,
  };
}

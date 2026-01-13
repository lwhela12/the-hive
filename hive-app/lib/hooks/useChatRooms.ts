import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { ChatRoom, Profile, RoomMessage, ChatRoomMember } from '../../types';

export type RoomWithData = ChatRoom & {
  members?: Array<ChatRoomMember & { user?: Profile }>;
  last_message?: RoomMessage & { sender?: Profile };
  unread_count?: number;
};

export function useChatRooms(communityId?: string, userId?: string) {
  const [rooms, setRooms] = useState<RoomWithData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    if (!communityId || !userId) {
      setLoading(false);
      return;
    }

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
        .filter((r) => r && r.room_type === 'dm')),
    ];

    const uniqueRooms = Array.from(
      new Map(allRooms.map((r) => [r.id, r])).values()
    );

    // Fetch additional data for each room
    const roomsWithData: RoomWithData[] = await Promise.all(
      uniqueRooms.map(async (room) => {
        // Get members for DM rooms
        let members: Array<ChatRoomMember & { user?: Profile }> = [];
        if (room.room_type === 'dm') {
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
          .single();

        // Get unread count
        const { data: membershipData } = await supabase
          .from('chat_room_members')
          .select('last_read_at')
          .eq('room_id', room.id)
          .eq('user_id', userId)
          .single();

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

    setRooms(roomsWithData);
    setLoading(false);
  }, [communityId, userId]);

  useEffect(() => {
    fetchRooms();

    // Subscribe to room message changes
    if (communityId) {
      const channel = supabase
        .channel('chat-rooms-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_messages',
            filter: `community_id=eq.${communityId}`,
          },
          () => {
            fetchRooms();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [communityId, fetchRooms]);

  const getOrCreateDMRoom = useCallback(
    async (otherUserId: string): Promise<RoomWithData | null> => {
      if (!communityId || !userId) return null;

      try {
        const { data, error } = await supabase.rpc('get_or_create_dm_room', {
          p_community_id: communityId,
          p_user1_id: userId,
          p_user2_id: otherUserId,
        });

        if (error) throw error;

        // Fetch the room with full data
        const { data: roomData } = await supabase
          .from('chat_rooms')
          .select('*')
          .eq('id', data)
          .single();

        if (roomData) {
          const { data: memberData } = await supabase
            .from('chat_room_members')
            .select('*, user:profiles(*)')
            .eq('room_id', roomData.id);

          const roomWithData: RoomWithData = {
            ...roomData,
            members: (memberData || []) as Array<ChatRoomMember & { user?: Profile }>,
          };

          // Refresh the room list
          await fetchRooms();

          return roomWithData;
        }

        return null;
      } catch (error) {
        console.error('Error creating DM room:', error);
        return null;
      }
    },
    [communityId, userId, fetchRooms]
  );

  return {
    rooms,
    loading,
    refetch: fetchRooms,
    getOrCreateDMRoom,
  };
}

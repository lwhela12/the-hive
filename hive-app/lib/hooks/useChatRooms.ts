import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatRoomsQuery, RoomWithData } from './useChatRoomsQuery';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type { Profile, ChatRoomMember } from '../../types';

// Re-export the type for backwards compatibility
export type { RoomWithData };

/**
 * Hook for managing chat rooms.
 * Uses React Query internally for caching and optimized updates.
 *
 * @param communityId - The community ID to fetch rooms for
 * @param userId - The current user's ID
 */
export function useChatRooms(communityId?: string, userId?: string) {
  const queryClient = useQueryClient();
  const {
    rooms,
    loading,
    refetch,
    updateRoomLastMessage,
    markRoomAsRead,
  } = useChatRoomsQuery(communityId, userId);

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
        const { data: roomData, error: roomError } = await supabase
          .from('chat_rooms')
          .select('*')
          .eq('id', data)
          .single();

        if (roomError) throw roomError;
        if (!roomData)
          throw new Error('Room was created but could not be retrieved');

        const { data: memberData, error: memberError } = await supabase
          .from('chat_room_members')
          .select('*, user:profiles(*)')
          .eq('room_id', roomData.id);

        if (memberError) throw memberError;

        const roomWithData: RoomWithData = {
          ...roomData,
          members: (memberData || []) as Array<
            ChatRoomMember & { user?: Profile }
          >,
        };

        // Invalidate and refetch to update the cache
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chatRooms(communityId),
        });

        return roomWithData;
      } catch (error) {
        console.error('Error creating DM room:', error);
        return null;
      }
    },
    [communityId, userId, queryClient]
  );

  const getOrCreateGroupDMRoom = useCallback(
    async (otherUserIds: string[]): Promise<RoomWithData | null> => {
      if (!communityId || !userId) return null;

      try {
        // Include current user in the group
        const allUserIds = [userId, ...otherUserIds];

        const { data, error } = await supabase.rpc('get_or_create_group_dm_room', {
          p_community_id: communityId,
          p_user_ids: allUserIds,
        });

        if (error) throw error;

        // Fetch the room with full data
        const { data: roomData, error: roomError } = await supabase
          .from('chat_rooms')
          .select('*')
          .eq('id', data)
          .single();

        if (roomError) throw roomError;
        if (!roomData)
          throw new Error('Room was created but could not be retrieved');

        const { data: memberData, error: memberError } = await supabase
          .from('chat_room_members')
          .select('*, user:profiles(*)')
          .eq('room_id', roomData.id);

        if (memberError) throw memberError;

        const roomWithData: RoomWithData = {
          ...roomData,
          members: (memberData || []) as Array<
            ChatRoomMember & { user?: Profile }
          >,
        };

        // Invalidate and refetch to update the cache
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chatRooms(communityId),
        });

        return roomWithData;
      } catch (error) {
        console.error('Error creating group DM room:', error);
        return null;
      }
    },
    [communityId, userId, queryClient]
  );

  return {
    rooms,
    loading,
    refetch,
    getOrCreateDMRoom,
    getOrCreateGroupDMRoom,
    // Additional methods from React Query hook
    updateRoomLastMessage,
    markRoomAsRead,
  };
}

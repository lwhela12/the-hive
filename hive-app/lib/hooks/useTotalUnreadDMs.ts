import { useMemo } from 'react';
import { useChatRoomsQuery } from './useChatRoomsQuery';

/**
 * Hook to get the total count of unread DM messages across all chat rooms.
 * Uses the same underlying React Query cache as useChatRooms for efficiency.
 */
export function useTotalUnreadDMs(communityId?: string, userId?: string) {
  const { rooms, loading } = useChatRoomsQuery(communityId, userId);

  const totalUnread = useMemo(() => {
    if (!rooms || rooms.length === 0) return 0;

    // Sum unread_count across all DM rooms (exclude community rooms if needed)
    return rooms.reduce((sum, room) => {
      // Only count DM rooms, not community chat rooms
      if (room.room_type === 'dm') {
        return sum + (room.unread_count || 0);
      }
      return sum;
    }, 0);
  }, [rooms]);

  return {
    totalUnread,
    loading,
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { ChatRoom } from '../../types';

/**
 * The one room every HIVE shares.
 *
 * Found by what it IS rather than by an id in the code: `reach = 'all_hives'`
 * (migration 139). A hardcoded uuid would have been shorter and would break the
 * day anybody rebuilt the row, and an id in the source is the kind of thing
 * that survives into a second environment and quietly points at nothing.
 *
 * It deliberately does NOT come through useChatRoomsQuery: that hook asks for
 * rooms belonging to the HIVE you are standing in, which this room is not. It
 * is fetched on its own and injected where the list needs it.
 *
 * Returns null rather than throwing when the row is missing, so a member sees
 * the quiet "still being built" panel instead of a broken screen.
 */
export function useHiveWideRoom() {
  return useQuery<ChatRoom | null>({
    queryKey: ['hive-wide-room'],
    // It moves roughly never; refetching it on every focus would be noise.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('reach', 'all_hives')
        .eq('room_type', 'community')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Could not find the HIVE-Wide room', error);
        return null;
      }
      return (data as ChatRoom) ?? null;
    },
  });
}

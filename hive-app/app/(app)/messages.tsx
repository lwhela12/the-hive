import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { ChatRoomItem } from '../../components/messaging/ChatRoomItem';
import { RoomChatView } from '../../components/messaging/RoomChatView';
import { MemberPicker } from '../../components/messaging/MemberPicker';
import type { ChatRoom, Profile, RoomMessage, ChatRoomMember } from '../../types';

type RoomWithData = ChatRoom & {
  members?: Array<ChatRoomMember & { user?: Profile }>;
  last_message?: RoomMessage & { sender?: Profile };
  unread_count?: number;
};

export default function MessagesScreen() {
  const { profile, communityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState<RoomWithData[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithData | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const fetchRooms = useCallback(async () => {
    if (!communityId || !profile) return;

    // Fetch community rooms
    const { data: communityRooms, error: communityError } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('community_id', communityId)
      .eq('room_type', 'community');

    // Fetch DM rooms the user is a member of
    const { data: memberRooms, error: memberError } = await supabase
      .from('chat_room_members')
      .select('room:chat_rooms(*)')
      .eq('user_id', profile.id);

    if (communityError || memberError) {
      console.error('Error fetching rooms:', communityError || memberError);
      return;
    }

    // Combine rooms
    const allRooms: ChatRoom[] = [
      ...(communityRooms || []),
      ...((memberRooms || [])
        .map((m) => m.room as ChatRoom)
        .filter((r) => r && r.room_type === 'dm')),
    ];

    // Deduplicate by ID
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
          .eq('user_id', profile.id)
          .single();

        let unreadCount = 0;
        if (membershipData?.last_read_at) {
          const { count } = await supabase
            .from('room_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id)
            .gt('created_at', membershipData.last_read_at)
            .neq('sender_id', profile.id);
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
  }, [communityId, profile]);

  useEffect(() => {
    fetchRooms();

    // Subscribe to room changes
    if (communityId) {
      const channel = supabase
        .channel('rooms-updates')
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

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRooms();
    setRefreshing(false);
  };

  const handleStartDM = async (member: Profile) => {
    if (!profile || !communityId) return;

    try {
      // Use the database function to get or create DM room
      const { data, error } = await supabase.rpc('get_or_create_dm_room', {
        p_community_id: communityId,
        p_user1_id: profile.id,
        p_user2_id: member.id,
      });

      if (error) throw error;

      // Fetch the room with full data
      const { data: roomData } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('id', data)
        .single();

      if (roomData) {
        // Get members
        const { data: memberData } = await supabase
          .from('chat_room_members')
          .select('*, user:profiles(*)')
          .eq('room_id', roomData.id);

        const roomWithData: RoomWithData = {
          ...roomData,
          members: (memberData || []) as Array<ChatRoomMember & { user?: Profile }>,
        };

        setSelectedRoom(roomWithData);
        await fetchRooms();
      }
    } catch (error) {
      console.error('Error creating DM:', error);
      Alert.alert('Error', 'Failed to start conversation.');
    }
  };

  // Show chat view if room is selected
  if (selectedRoom) {
    return (
      <RoomChatView
        room={selectedRoom}
        onBack={() => {
          setSelectedRoom(null);
          fetchRooms();
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between bg-white px-4 py-3 border-b border-cream">
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal">
          Messages
        </Text>
        <Pressable
          onPress={() => setShowMemberPicker(true)}
          className="w-10 h-10 bg-gold rounded-full items-center justify-center"
        >
          <Text className="text-white text-xl">+</Text>
        </Pressable>
      </View>

      {/* Room list */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {rooms.length === 0 ? (
          <View className="items-center py-8">
            <Text className="text-4xl mb-4">💬</Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
              No conversations yet.{'\n'}
              Tap + to start a new message.
            </Text>
          </View>
        ) : (
          rooms.map((room) => (
            <ChatRoomItem
              key={room.id}
              room={room}
              currentUserId={profile?.id}
              onPress={() => setSelectedRoom(room)}
            />
          ))
        )}
      </ScrollView>

      {/* Member picker modal */}
      <MemberPicker
        visible={showMemberPicker}
        onClose={() => setShowMemberPicker(false)}
        onSelect={handleStartDM}
      />
    </SafeAreaView>
  );
}

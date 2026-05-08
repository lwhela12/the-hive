import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/hooks/useAuth';
import { useChatRooms, RoomWithData } from '../../lib/hooks/useChatRooms';
import { prefetchRoomMessages } from '../../lib/hooks/useRoomMessagesQuery';
import { ChatRoomItem } from '../../components/messaging/ChatRoomItem';
import { RoomChatView } from '../../components/messaging/RoomChatView';
import { MemberPicker } from '../../components/messaging/MemberPicker';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import type { Profile } from '../../types';

export default function MessagesScreen() {
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const { profile, communityId } = useAuth();
  const { totalUnread: unreadDMCount } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithData | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const hasPrefetchedRef = useRef(false);
  const selectedRoomStorageKey = communityId ? `the-hive:last-chat-room:${communityId}` : null;

  // Use the optimized chat rooms hook (React Query with caching)
  const { rooms, loading, refetch, getOrCreateDMRoom, getOrCreateGroupDMRoom, markRoomAsRead } = useChatRooms(
    communityId ?? undefined,
    profile?.id
  );

  // Prefetch messages for top 7 rooms when room list loads
  useEffect(() => {
    if (rooms.length > 0 && !hasPrefetchedRef.current) {
      // Prefetch messages for top 7 rooms (sorted by most recent activity)
      // Only prefetch rooms that have valid IDs
      const topRooms = rooms.slice(0, 7).filter((room) => room.id);
      if (topRooms.length > 0) {
        hasPrefetchedRef.current = true;
        topRooms.forEach((room) => {
          prefetchRoomMessages(queryClient, room.id);
        });
      }
    }
  }, [rooms, queryClient]);

  useEffect(() => {
    if (selectedRoom || rooms.length === 0) return;

    const savedRoomId = selectedRoomStorageKey && typeof window !== 'undefined'
      ? window.localStorage.getItem(selectedRoomStorageKey)
      : null;
    const roomToRestore = rooms.find((room) => room.id === (roomId || savedRoomId));

    if (roomToRestore) {
      setSelectedRoom(roomToRestore);
      markRoomAsRead(roomToRestore.id);
    }
  }, [markRoomAsRead, roomId, rooms, selectedRoom, selectedRoomStorageKey]);

  const openRoom = useCallback((room: RoomWithData) => {
    markRoomAsRead(room.id);
    setSelectedRoom(room);

    if (selectedRoomStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(selectedRoomStorageKey, room.id);
    }
  }, [markRoomAsRead, selectedRoomStorageKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleStartDM = async (member: Profile) => {
    if (!profile || !communityId) return;

    try {
      const roomWithData = await getOrCreateDMRoom(member.id);
      if (roomWithData) {
        openRoom(roomWithData);
      }
    } catch (error) {
      console.error('Error creating DM:', error);
      Alert.alert('Error', 'Failed to start conversation.');
    }
  };

  const handleStartGroupDM = async (members: Profile[]) => {
    if (!profile || !communityId) return;

    try {
      const roomWithData = await getOrCreateGroupDMRoom(members.map((m) => m.id));
      if (roomWithData) {
        openRoom(roomWithData);
      }
    } catch (error) {
      console.error('Error creating group DM:', error);
      Alert.alert('Error', 'Failed to start group conversation.');
    }
  };

  // Show chat view if room is selected
  if (selectedRoom) {
    return (
      <RoomChatView
        room={selectedRoom}
        onBack={() => {
          // Mark room as read when leaving
          markRoomAsRead(selectedRoom.id);
          setSelectedRoom(null);
          if (selectedRoomStorageKey && typeof window !== 'undefined') {
            window.localStorage.removeItem(selectedRoomStorageKey);
          }
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout ? (
        <AppHeader
          title="Chat"
          onMenuPress={() => setDrawerOpen(true)}
          rightElement={
            <Pressable
              onPress={() => setShowMemberPicker(true)}
              className="w-10 h-10 bg-gold rounded-full items-center justify-center"
            >
              <Text className="text-white text-xl">+</Text>
            </Pressable>
          }
        />
      ) : (
        <View className="flex-row items-center justify-between bg-charcoal px-4 py-3">
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-xl text-white">
            Chat
          </Text>
          <Pressable
            onPress={() => setShowMemberPicker(true)}
            className="w-10 h-10 bg-gold rounded-full items-center justify-center"
          >
            <Text className="text-white text-xl">+</Text>
          </Pressable>
        </View>
      )}

      {/* Navigation Drawer */}
      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mode="navigation"
          unreadDMCount={unreadDMCount}
        />
      )}

      {/* Room list — FlatList keeps JS thread free during load */}
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatRoomItem
            room={item}
            currentUserId={profile?.id}
            onPress={() => openRoom(item)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing || loading} onRefresh={onRefresh} tintColor="#bd9348" />
        }
        ListEmptyComponent={
          loading ? (
            <View className="mt-2">
              {[...Array(5)].map((_, i) => (
                <View key={i} className="flex-row items-center px-4 py-4 bg-white border-b border-gray-100">
                  <View className="w-12 h-12 rounded-full bg-gray-200 mr-3" />
                  <View className="flex-1">
                    <View className="h-4 bg-gray-200 rounded w-2/5 mb-2" />
                    <View className="h-3 bg-gray-100 rounded w-3/4" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="items-center py-8">
              <Text className="text-4xl mb-4">💬</Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                No conversations yet.{'\n'}
                Tap + to start a new message.
              </Text>
            </View>
          )
        }
      />

      {/* Member picker modal */}
      <MemberPicker
        visible={showMemberPicker}
        onClose={() => setShowMemberPicker(false)}
        onSelect={handleStartDM}
        onSelectMultiple={handleStartGroupDM}
        multiSelect={true}
      />
    </SafeAreaView>
  );
}

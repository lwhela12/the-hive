import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { useChatRooms, RoomWithData } from '../../lib/hooks/useChatRooms';
import { prefetchRoomMessages } from '../../lib/hooks/useRoomMessagesQuery';
import { getStoredItemAsync, removeStoredItemAsync, setStoredItemAsync } from '../../lib/webStorage';
import { ChatRoomItem } from '../../components/messaging/ChatRoomItem';
import { RoomChatView } from '../../components/messaging/RoomChatView';
import { MemberPicker } from '../../components/messaging/MemberPicker';
import type { Profile } from '../../types';

export default function MessagesScreen() {
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const router = useRouter();
  const { profile, communityId } = useAuth();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const useMobileLayout = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithData | null>(null);
  const [customizeRoomOnOpen, setCustomizeRoomOnOpen] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const hasPrefetchedRef = useRef(false);
  const ignoredDirectRoomIdRef = useRef<string | null>(null);
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
    if (!roomId || roomId !== ignoredDirectRoomIdRef.current) {
      ignoredDirectRoomIdRef.current = null;
    }
    if (selectedRoom || rooms.length === 0) return;

    const directRoomId = roomId && roomId !== ignoredDirectRoomIdRef.current ? roomId : null;

    if (directRoomId) {
      const directRoom = rooms.find((room) => room.id === directRoomId);
      if (directRoom) {
        setSelectedRoom(directRoom);
        markRoomAsRead(directRoom.id);
        if (selectedRoomStorageKey) {
          void setStoredItemAsync(selectedRoomStorageKey, directRoom.id);
        }
      }
      return;
    }

    if (!selectedRoomStorageKey) return;

    let cancelled = false;
    getStoredItemAsync(selectedRoomStorageKey).then((savedRoomId) => {
      if (cancelled || !savedRoomId) return;

      const savedRoom = rooms.find((room) => room.id === savedRoomId);
      if (savedRoom) {
        setSelectedRoom(savedRoom);
        markRoomAsRead(savedRoom.id);
      } else {
        void removeStoredItemAsync(selectedRoomStorageKey);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [markRoomAsRead, roomId, rooms, selectedRoom, selectedRoomStorageKey]);

  const openRoom = useCallback((room: RoomWithData) => {
    markRoomAsRead(room.id);
    setSelectedRoom(room);
    setCustomizeRoomOnOpen(false);

    if (selectedRoomStorageKey) {
      void setStoredItemAsync(selectedRoomStorageKey, room.id);
    }
  }, [markRoomAsRead, selectedRoomStorageKey]);

  const openRoomCustomizer = useCallback((room: RoomWithData) => {
    markRoomAsRead(room.id);
    setCustomizeRoomOnOpen(true);
    setSelectedRoom(room);

    if (selectedRoomStorageKey) {
      void setStoredItemAsync(selectedRoomStorageKey, room.id);
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
        startCustomizing={customizeRoomOnOpen}
        onBack={() => {
          // Mark room as read when leaving
          markRoomAsRead(selectedRoom.id);
          if (roomId) {
            ignoredDirectRoomIdRef.current = roomId;
            router.replace('/messages');
          }
          setSelectedRoom(null);
          setCustomizeRoomOnOpen(false);
          if (selectedRoomStorageKey) {
            void removeStoredItemAsync(selectedRoomStorageKey);
          }
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout ? (
        <View className="flex-row items-center justify-between bg-cream px-5 pt-2 pb-3">
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-charcoal text-3xl">
            Messages
          </Text>
          <Pressable
            onPress={() => setShowMemberPicker(true)}
            className="w-10 h-10 bg-gold rounded-full items-center justify-center active:opacity-80"
            hitSlop={8}
          >
            <Ionicons name="add" size={25} color="white" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center justify-between bg-gold px-4 py-3">
          <View className="w-10 h-10" />
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-base text-white">
            Messages
          </Text>
          <Pressable
            onPress={() => setShowMemberPicker(true)}
            className="w-10 h-10 items-center justify-center active:opacity-70"
          >
            <Text className="text-white text-xl">+</Text>
          </Pressable>
        </View>
      )}

      {/* Room list — FlatList keeps JS thread free during load */}
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: useMobileLayout ? 96 : 24 }}
        renderItem={({ item }) => (
          <ChatRoomItem
            room={item}
            currentUserId={profile?.id}
            onPress={() => openRoom(item)}
            onCustomize={() => openRoomCustomizer(item)}
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

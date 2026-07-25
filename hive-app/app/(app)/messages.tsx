import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, ScrollView, Image, RefreshControl, Pressable, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useChatRooms, RoomWithData } from '../../lib/hooks/useChatRooms';
import { prefetchRoomMessages } from '../../lib/hooks/useRoomMessagesQuery';
import { getStoredItemAsync, removeStoredItemAsync, setStoredItemAsync } from '../../lib/webStorage';
import { ChatRoomItem } from '../../components/messaging/ChatRoomItem';
import { AppHeader } from '../../components/navigation';
import { RoomChatView } from '../../components/messaging/RoomChatView';
import { MemberPicker } from '../../components/messaging/MemberPicker';
import { Avatar } from '../../components/ui/Avatar';
import {
  getOtherRoomMembers,
  getRoomCustomization,
  getRoomDisplayName,
} from '../../lib/chatRoomDisplay';
import type { Profile } from '../../types';

const hiveLogo = require('../../assets/HIVE Logo Transparent  BG.png');

// Mac-Messages-style pinned bubble for the desktop split view's left rail.
function RoomBubble({
  room,
  currentUserId,
  isActive,
  onPress,
}: {
  room: RoomWithData;
  currentUserId?: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const customization = getRoomCustomization(room, currentUserId);
  const roomName = getRoomDisplayName(room, currentUserId);
  const otherMember = getOtherRoomMembers(room, currentUserId)[0];
  const hasUnread = (room.unread_count ?? 0) > 0;

  const face = customization.imageUrl ? (
    <Image source={{ uri: customization.imageUrl }} style={{ width: 54, height: 54, borderRadius: 27 }} resizeMode="cover" />
  ) : customization.emoji ? (
    <View className="w-[54px] h-[54px] rounded-full bg-[#fffdf5] border border-gold/30 items-center justify-center">
      <Text style={{ fontSize: 26, lineHeight: 32 }}>{customization.emoji}</Text>
    </View>
  ) : room.room_type === 'community' ? (
    <Image source={hiveLogo} style={{ width: 54, height: 54, borderRadius: 27 }} resizeMode="cover" />
  ) : (
    <Avatar name={otherMember?.name || roomName} url={otherMember?.avatar_url} size={54} />
  );

  return (
    <Pressable onPress={onPress} className="items-center active:opacity-75" style={{ width: 72 }}>
      <View
        style={{
          padding: 2,
          borderRadius: 31,
          borderWidth: 2,
          borderColor: isActive ? '#bd9348' : hasUnread ? 'rgba(189,147,72,0.55)' : 'transparent',
        }}
      >
        {face}
      </View>
      <Text
        style={{ fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 11, marginTop: 3 }}
        className={isActive ? 'text-[#8e6f35]' : 'text-charcoal/70'}
        numberOfLines={1}
      >
        {roomName}
      </Text>
    </Pressable>
  );
}

// The rail is a "start a chat" strip, not a second copy of the list below it.
// It used to show the first six ROOMS — the same rooms already listed underneath
// — so it duplicated the list and hid anyone you hadn't messaged yet. Now it's
// General plus every member, whether or not a conversation exists (Nat
// 2026-07-25). Pinned favourites can layer on later, iMessage-style.
function MemberBubble({
  member,
  isActive,
  onPress,
}: {
  member: Profile;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="items-center active:opacity-75" style={{ width: 72 }}>
      <View
        style={{
          padding: 2,
          borderRadius: 31,
          borderWidth: 2,
          borderColor: isActive ? '#bd9348' : 'transparent',
        }}
      >
        <Avatar name={member.name} url={member.avatar_url} size={54} />
      </View>
      <Text
        style={{ fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 11, marginTop: 3 }}
        className={isActive ? 'text-[#8e6f35]' : 'text-charcoal/70'}
        numberOfLines={1}
      >
        {member.name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

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
  const [railMembers, setRailMembers] = useState<Profile[]>([]);
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

  // Everyone in the HIVE except you — the rail's cast.
  useEffect(() => {
    if (!communityId || !profile) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('community_memberships')
        .select('user:profiles(*)')
        .eq('community_id', communityId)
        .neq('user_id', profile.id);
      if (cancelled || error || !data) return;
      const people = (data as unknown as { user: Profile | null }[])
        .map((row) => row.user)
        .filter((person): person is Profile => person !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      setRailMembers(people);
    })().catch((error) => console.warn('Could not load the chat rail', error));

    return () => { cancelled = true; };
  }, [communityId, profile]);

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

  const handleBackFromRoom = () => {
    if (!selectedRoom) return;
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
  };

  // Mobile: a selected room takes the whole screen (the flow Lucas loves).
  // Desktop renders the split view below instead.
  if (selectedRoom && useMobileLayout) {
    return (
      <RoomChatView
        room={selectedRoom}
        startCustomizing={customizeRoomOnOpen}
        onBack={handleBackFromRoom}
      />
    );
  }

  const roomList = (
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
          isActive={!useMobileLayout && selectedRoom?.id === item.id}
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
  );

  const memberPicker = (
    <MemberPicker
      visible={showMemberPicker}
      onClose={() => setShowMemberPicker(false)}
      onSelect={handleStartDM}
      onSelectMultiple={handleStartGroupDM}
      multiSelect={true}
    />
  );

  if (useMobileLayout) {
    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
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
        {roomList}
        {memberPicker}
      </SafeAreaView>
    );
  }

  // Desktop: Mac-Messages-style split — the rail + your conversations on the
  // left, the open one filling the right.
  const communityRoom = rooms.find((room) => room.room_type === 'community') ?? null;
  const activeDmMemberId = selectedRoom && selectedRoom.room_type !== 'community'
    ? getOtherRoomMembers(selectedRoom, profile?.id)[0]?.id ?? null
    : null;

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <AppHeader
        title="Messages"
        rightElement={
          <Pressable
            onPress={() => setShowMemberPicker(true)}
            className="w-10 h-10 items-center justify-center active:opacity-70"
            accessibilityLabel="New message"
          >
            <Text className="text-white text-xl">+</Text>
          </Pressable>
        }
      />
      <View className="flex-1 flex-row">
        <View
          style={{ width: 360, borderRightWidth: 1, borderRightColor: 'rgba(222,193,129,0.5)' }}
        >
          {(communityRoom || railMembers.length > 0) && (
            <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.28)' }}>
              {/* Wrapped rows, four across — one row ran the bubbles off the
                  edge ("Infiniti E…") and wasted the column's width. */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: 12,
                  paddingTop: 12,
                  paddingBottom: 10,
                  rowGap: 8,
                }}
              >
                {communityRoom ? (
                  <View key={communityRoom.id} style={{ width: '25%', alignItems: 'center' }}>
                    <RoomBubble
                      room={communityRoom}
                      currentUserId={profile?.id}
                      isActive={selectedRoom?.id === communityRoom.id}
                      onPress={() => openRoom(communityRoom)}
                    />
                  </View>
                ) : null}
                {railMembers.map((member) => (
                  <View key={member.id} style={{ width: '25%', alignItems: 'center' }}>
                    <MemberBubble
                      member={member}
                      isActive={activeDmMemberId === member.id}
                      onPress={() => void handleStartDM(member)}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
          {roomList}
        </View>
        <View className="flex-1">
          {selectedRoom ? (
            <RoomChatView
              key={selectedRoom.id}
              room={selectedRoom}
              startCustomizing={customizeRoomOnOpen}
              onBack={handleBackFromRoom}
              hideBackButton
            />
          ) : (
            <View className="flex-1 items-center justify-center bg-[#fffdf5]">
              <Text style={{ fontSize: 44 }}>🍯</Text>
              <Text
                style={{ fontFamily: 'Lato_400Regular' }}
                className="text-[#8e7a5e] text-base mt-3"
              >
                Pick a chat to dig in
              </Text>
            </View>
          )}
        </View>
      </View>
      {memberPicker}
    </SafeAreaView>
  );
}

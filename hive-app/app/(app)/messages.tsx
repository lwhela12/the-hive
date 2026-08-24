import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, useWindowDimensions } from 'react-native';
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
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { RoomChatView } from '../../components/messaging/RoomChatView';
import { MemberPicker } from '../../components/messaging/MemberPicker';
import { Avatar } from '../../components/ui/Avatar';
import { HiveWideRoomCard, HiveWideBubble } from '../../components/messaging/HiveWideRoomCard';
import { HiveWideRoomView } from '../../components/messaging/HiveWideRoomView';
import { useHiveWideRoom } from '../../lib/hooks/useHiveWideRoom';
import { usePageSkin } from '../../lib/pageSkin';
import { showAlert } from '../../lib/showAlert';
import { getMessagesRoomLabel } from '../../components/messaging/hiveWideRoom';
import { hiveDisplayName, hiveAccent, accentWash } from '../../lib/hiveBrand';
import { HiveMark } from '../../components/ui/HiveMark';
import {
  getOtherRoomMembers,
  getRoomCustomization,
} from '../../lib/chatRoomDisplay';
import type { Profile } from '../../types';

import { SignedImage } from '../../components/ui/SignedImage';
import { useEndBounce } from '../../components/ui/BounceScrollView';

/**
 * The message list holds your rooms — and on a phone, one thing that has no
 * room of its own in it: HIVE-Wide. On a phone the list is the only surface,
 * so the HIVE-Wide card is the door to the shared room there. On desktop the
 * rail above the list carries that door (`HiveWideBubble`), so the list card
 * came out on 2026-08-11 — Nat, twice: it duplicated the rail bubble and the
 * shared room hasn't been used yet.
 */
type MessagesListEntry =
  | { kind: 'room'; room: RoomWithData }
  | { kind: 'hive-wide' };

// Mac-Messages-style pinned bubble for the desktop split view's left rail.
function RoomBubble({
  room,
  currentUserId,
  hiveName,
  isActive,
  onPress,
}: {
  room: RoomWithData;
  currentUserId?: string;
  hiveName: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const { community } = useAuth();
  const roomAccent = hiveAccent(community);
  const customization = getRoomCustomization(room, currentUserId);
  const roomName = getMessagesRoomLabel(room, currentUserId, hiveName);
  const otherMember = getOtherRoomMembers(room, currentUserId)[0];
  const hasUnread = (room.unread_count ?? 0) > 0;

  const face = customization.imageUrl ? (
    <SignedImage uri={customization.imageUrl} style={{ width: 54, height: 54, borderRadius: 27 }} resizeMode="cover" />
  ) : customization.emoji ? (
    <View className="w-[54px] h-[54px] rounded-full bg-[#fffdf5] border border-gold/30 items-center justify-center">
      <Text style={{ fontSize: 26, lineHeight: 32 }}>{customization.emoji}</Text>
    </View>
  ) : room.room_type === 'community' ? (
    // Your HIVE's own room, wearing your HIVE's colour — same pairing as
    // `ChatRoomItem`. This used to be one fixed ornate logo image for every
    // HIVE's own-community bubble, so OG's and Tech's rooms looked identical
    // here. HIVE-Wide keeps its own distinct mark (`HiveWideBubble`'s
    // `WorldMark`) — this only covers a HIVE's own room.
    <View
      style={{
        width: 54,
        height: 54,
        borderRadius: 27,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accentWash(roomAccent, 0.14),
        borderWidth: 1,
        borderColor: accentWash(roomAccent, 0.35),
      }}
    >
      <HiveMark size={26} colour={roomAccent} />
    </View>
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
  const { profile, communityId, community, wholeHive } = useAuth();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const useMobileLayout = width < 768;
  const skin = usePageSkin();
  const hiveName = hiveDisplayName(community?.name);
  // The room every HIVE shares. It has a row of its own now (migration 139), so
  // opening it opens the real chat view — composer, replies, reactions and all —
  // instead of the sign that used to stand in for it.
  const { data: hiveWideRoom } = useHiveWideRoom();
  // Most people have a handful of rooms, so this list usually has nothing to
  // scroll. The bounce is what says so.
  const roomListBounceRef = useEndBounce();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithData | null>(null);
  // Which pane is showing. Still screen state rather than a route, because the
  // room list and the open room share one screen on desktop.
  const [showHiveWide, setShowHiveWide] = useState(false);
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

  // Where you were standing the last time this effect looked. Seeded with the
  // first render's answer, so it never fires on arrival — only on a real swap.
  const prevStandingRef = useRef({ wholeHive, communityId });

  // Swapping where you stand — up to HIVE-Wide, back down into your HIVE, or
  // across to another HIVE — happens WITHOUT this screen unmounting:
  // `enterWholeHive` and `switchCommunity` stay on /messages on purpose
  // (`routeAfterHiveSwitch`), and stepping up to HIVE-Wide flips `wholeHive`
  // alone while `communityId` stays put underneath (see lib/hooks/useAuth.ts).
  // So until 2026-08-11 an open OG room simply STAYED open through the swap,
  // sitting under HIVE-Wide's black header. Nat, seeing it live: "We dont want
  // that stuff to bleed over, it looks like its broken... the fact that this
  // bleeds kills their faith."
  //
  // The rule now: after any swap, this screen shows exactly what it would show
  // if you had just arrived. Entering HIVE-Wide that means the shared room —
  // the restore effect below already opens it for a fresh arrival, so opening
  // it here directly is the same destination without the flash in between, and
  // it means the one room that legitimately exists in both places (the shared
  // HIVE-Wide room, if you had it open) stays open rather than blinking shut.
  // Stepping down means the list, never a HIVE-Wide leftover.
  useEffect(() => {
    const prev = prevStandingRef.current;
    const swappedMode = prev.wholeHive !== wholeHive;
    // `communityId` is null while the saved sign-in is still loading; only a
    // move between two real HIVEs is a swap. Null -> first id is arrival, and
    // resetting on arrival would wipe the last-room restore below.
    const swappedHive =
      prev.communityId !== communityId && prev.communityId !== null && communityId !== null;
    prevStandingRef.current = { wholeHive, communityId };
    if (!swappedMode && !swappedHive) return;

    setSelectedRoom(null);
    setCustomizeRoomOnOpen(false);
    setShowMemberPicker(false);
    setShowHiveWide(wholeHive);
    // A new HIVE means a new set of rooms worth warming up.
    if (swappedHive) hasPrefetchedRef.current = false;
    // A ?roomId left in the address belongs to where you were standing; the
    // restore effect would obediently reopen that room here. Same discard as
    // handleBackFromRoom.
    if (roomId) {
      ignoredDirectRoomIdRef.current = roomId;
      router.replace('/messages');
    }
    // Entering HIVE-Wide forgets the HIVE room you were reading, exactly as
    // `openHiveWide` does — stepping back down should land on the list, never
    // shove you into the room you left behind. A HIVE-to-HIVE swap keeps the
    // NEW HIVE's memory, because restoring its last room is precisely what a
    // fresh arrival there does.
    if (swappedMode && wholeHive && selectedRoomStorageKey) {
      void removeStoredItemAsync(selectedRoomStorageKey);
    }
  }, [wholeHive, communityId, roomId, router, selectedRoomStorageKey]);

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
    // Standing in HIVE-Wide counts as having chosen a room. Without this the
    // last-room-you-read restore would arrive a moment later and shove you back
    // out of it.
    if (selectedRoom || showHiveWide || rooms.length === 0) return;

    // Arriving here from the rail while standing at HIVE-Wide: the HIVE-Wide
    // room is the one you meant. Restoring one HIVE's last conversation would
    // quietly drop you back into that HIVE (Nat 2026-08-03).
    if (wholeHive && !roomId) {
      setShowHiveWide(true);
      return;
    }

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
  }, [markRoomAsRead, roomId, rooms, selectedRoom, selectedRoomStorageKey, showHiveWide, wholeHive]);

  const openHiveWide = useCallback(() => {
    setShowHiveWide(true);
    setSelectedRoom(null);
    setCustomizeRoomOnOpen(false);
    // Forget the last room you were reading, the same as backing out of one
    // does. Otherwise stepping back out of HIVE-Wide would drop you straight
    // into that old room instead of the list you were expecting.
    if (selectedRoomStorageKey) {
      void removeStoredItemAsync(selectedRoomStorageKey);
    }
  }, [selectedRoomStorageKey]);

  const openRoom = useCallback((room: RoomWithData) => {
    markRoomAsRead(room.id);
    setShowHiveWide(false);
    setSelectedRoom(room);
    setCustomizeRoomOnOpen(false);

    if (selectedRoomStorageKey) {
      void setStoredItemAsync(selectedRoomStorageKey, room.id);
    }
  }, [markRoomAsRead, selectedRoomStorageKey]);

  const openRoomCustomizer = useCallback((room: RoomWithData) => {
    markRoomAsRead(room.id);
    setShowHiveWide(false);
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

  // Your own HIVE first, then everyone you talk to — with HIVE-Wide slotted
  // directly under your HIVE's room on a phone, where the list is its only
  // door. While the rooms are still loading the list stays empty so the
  // skeleton has the screen to itself.
  const listEntries = useMemo<MessagesListEntry[]>(() => {
    // Standing at HIVE-Wide, the only conversation that belongs here is the
    // HIVE-Wide one. Every other room and DM in this list is OG's — they were
    // said inside OG, to OG, and letting them ride along under a black header
    // would be the app quietly showing one HIVE's private talk from a place
    // that is meant to be above all of them (Nat 2026-08-03).
    //
    // So the list has exactly one entry up here — and since migration 139 that
    // entry opens a room you can actually talk in, rather than a sign.
    if (wholeHive) return [{ kind: 'hive-wide' }];

    if (loading && rooms.length === 0) return [];

    // The shared room is dropped from the plain list, because it already has
    // its own entry directly below your HIVE's room.
    //
    // Nat, 2026-08-04: "we already have an OG HIVE chat with history, so keep
    // that one and delete the other one." There was nothing to delete — the
    // database has exactly one OG room, with all 24 of its messages. It was
    // being drawn TWICE, and the second copy was wearing OG's name.
    //
    // Why it happened: `get_chat_rooms_with_data` did not return the `reach`
    // column. The label rule checks `reach === 'all_hives'` FIRST precisely so
    // the shared room never wears a HIVE's name — with `reach` undefined that
    // test failed silently, the room fell through to the community-room rule,
    // and came back as "OG HIVE" with no messages in it.
    //
    // Filtering by id was the first answer, and it left the twin on screen
    // whenever that separate lookup had yet to land — which is every first
    // paint, and is why Nat saw it again on 2026-08-06. Migration 153 makes the
    // room list return `reach`, so the room now says what it is and the screen
    // can believe it. The id check stays as a belt to the braces.
    const sharedRoomId = hiveWideRoom?.id;
    const listedRooms = rooms.filter((room) => {
      if (room.reach === 'all_hives' || room.id === sharedRoomId) return false;
      // On desktop, the HIVE's own room joins this list only once somebody has
      // said something in it. Until then its card duplicated the rail bubble
      // directly above — in Tech HIVE the whole list was one empty room wearing
      // the HIVE's name. Nat, 2026-08-11: "No message chains should be
      // autopopulated here though, they are all just waiting for their first
      // message, so this part should be empty." Same rule the HIVE-Wide card
      // follows (removed from the desktop list earlier the same day): the rail
      // bubble is the door until the conversation exists. On a phone there is
      // no rail, so the card stays as the only door.
      if (!useMobileLayout && room.room_type === 'community' && !room.last_message) return false;
      return true;
    });

    const entries: MessagesListEntry[] = listedRooms.map((room) => ({ kind: 'room', room }));

    // The pinned HIVE-Wide card rides in the list ONLY on a phone. On desktop
    // the rail above this list already holds the `HiveWideBubble`, so the card
    // was the same door drawn twice — and the room under it has no messages
    // yet, so the duplicate bought nothing. Nat asked for it gone twice, the
    // second time on 2026-08-11: "we already talked about getting rid of this
    // from the messages, because it hasnt been used yet." The phone layout
    // renders no rail at all, so there the card stays as the only door to the
    // shared room.
    if (useMobileLayout) {
      const ownHiveRoomIndex = listedRooms.findIndex((room) => room.room_type === 'community');
      entries.splice(ownHiveRoomIndex + 1, 0, { kind: 'hive-wide' });
    }
    return entries;
  }, [loading, rooms, wholeHive, hiveWideRoom?.id, useMobileLayout]);

  // The other members of the HIVE. Your own bubble joins them below.
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

  // The rail's cast: everyone in the HIVE, yourself included, one alphabetical
  // order. Your own face used to be left out, so in Tech HIVE — where Nat is so
  // far the only member — the rail was two doors and then nothing. Nat,
  // 2026-08-11: "The two icons at the top are correct, but then should also
  // show Nat Walstead profile bubble because i'm in the Tech Hive." Your bubble
  // sorts by the same rule as everyone else's rather than taking a place of
  // honour — the doors go big (HIVE-Wide) to medium (your HIVE) to small
  // (individual people), and you are one of the people.
  const railPeople = useMemo(() => {
    if (!profile) return railMembers;
    return [...railMembers, profile].sort((a, b) => a.name.localeCompare(b.name));
  }, [railMembers, profile]);

  const handleStartDM = async (member: Profile) => {
    if (!profile || !communityId) return;

    // Yourself included: migration 166 taught `get_or_create_dm_room` the
    // one-person case, so tapping your own bubble opens your notes-to-self
    // room through the exact same path as any other chat.
    try {
      const roomWithData = await getOrCreateDMRoom(member.id);
      if (roomWithData) {
        openRoom(roomWithData);
      }
    } catch (error) {
      console.error('Error creating DM:', error);
      // showAlert, never Alert.alert — react-native-web's Alert is an empty
      // class, so on the web (where nearly everyone is) the old message
      // vanished without a trace.
      showAlert('That conversation could not start', 'Give it another try in a moment.');
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
      showAlert('That conversation could not start', 'Give it another try in a moment.');
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

  if (showHiveWide && useMobileLayout) {
    // The real room when there is one; the honest empty sign only if the row is
    // missing, which would mean something is wrong rather than unbuilt.
    return hiveWideRoom ? (
      <RoomChatView
        key={hiveWideRoom.id}
        room={hiveWideRoom as unknown as RoomWithData}
        onBack={() => setShowHiveWide(false)}
      />
    ) : (
      <HiveWideRoomView hiveName={hiveName} onBack={() => setShowHiveWide(false)} />
    );
  }

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
    <FlatList<MessagesListEntry>
      ref={roomListBounceRef}
      data={listEntries}
      keyExtractor={(item) => (item.kind === 'room' ? item.room.id : 'hive-wide')}
      contentContainerStyle={{ paddingVertical: 8, paddingBottom: useMobileLayout ? 96 : 24 }}
      renderItem={({ item }) =>
        item.kind === 'hive-wide' ? (
          <HiveWideRoomCard isActive={!useMobileLayout && showHiveWide} onPress={openHiveWide} />
        ) : (
          <ChatRoomItem
            room={item.room}
            currentUserId={profile?.id}
            hiveName={hiveName}
            onPress={() => openRoom(item.room)}
            onCustomize={() => openRoomCustomizer(item.room)}
            isActive={!useMobileLayout && selectedRoom?.id === item.room.id}
          />
        )
      }
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
        ) : null
      }
      // On a phone HIVE-Wide is always in the list, so the list is never empty
      // there and the old "no conversations yet" panel would never have shown.
      // The nudge to start one lives down here, where it lands on both
      // layouts.
      ListFooterComponent={
        !loading && rooms.length === 0 ? (
          <View className="items-center py-8 px-8">
            <Text className="text-4xl mb-4">💬</Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
              Tap + to start a conversation with anyone in {hiveName}.
            </Text>
          </View>
        ) : null
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
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: skin.page }}>
        <SpaceBackdrop />
        <View
          className="flex-row items-center justify-between px-5 pt-2 pb-3"
          style={{ backgroundColor: skin.page }}
        >
          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', color: skin.ink }}
            className="text-3xl"
          >
            Messages
          </Text>
          {/* Starting a new message means picking a HIVE's members, and there is
              no one HIVE to ask up here — so the door to start one closes at
              HIVE-Wide, the same call already made for the room list and the
              face rail below (Nat's reversal, 2026-08-11). */}
          {!wholeHive && (
            <Pressable
              onPress={() => setShowMemberPicker(true)}
              className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: skin.gold }}
              hitSlop={8}
            >
              <Ionicons name="add" size={25} color="white" />
            </Pressable>
          )}
        </View>
        {roomList}
        {memberPicker}
      </SafeAreaView>
    );
  }

  // Desktop: Mac-Messages-style split — the rail + your conversations on the
  // left, the open one filling the right.
  //
  // The shared HIVE-Wide room is ALSO `room_type === 'community'` — that's how
  // it gets its everyone-in-it membership — so without the same `reach` and id
  // exclusion `listEntries` already applies above, `.find()` could grab it
  // instead of the HIVE's own room whenever it happened to sort first. That
  // fed `RoomBubble` the HIVE-Wide room, which then labelled itself
  // "HIVE-Wide" (see `getMessagesRoomLabel`) right next to the real
  // `HiveWideBubble` — two bubbles side by side both saying "HIVE-Wide".
  const communityRoom = rooms.find(
    (room) => room.room_type === 'community' && room.reach !== 'all_hives' && room.id !== hiveWideRoom?.id
  ) ?? null;
  const activeDmMemberId = selectedRoom && selectedRoom.room_type !== 'community'
    ? getOtherRoomMembers(selectedRoom, profile?.id)[0]?.id ?? null
    : null;

  return (
    <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: skin.page }}>
      <SpaceBackdrop />
      <AppHeader
        title="Messages"
        tone={wholeHive ? 'wide' : 'hive'}
        // No + at HIVE-Wide, same reasoning as the mobile header above: starting
        // a message means picking one HIVE's members, and there isn't one HIVE
        // to offer from up here.
        rightElement={
          wholeHive ? undefined : (
            <Pressable
              onPress={() => setShowMemberPicker(true)}
              className="w-10 h-10 items-center justify-center active:opacity-70"
              accessibilityLabel="New message"
            >
              <Text className="text-white text-xl">+</Text>
            </Pressable>
          )
        }
      />
      <View className="flex-1 flex-row">
        <View
          style={{ width: 360, borderRightWidth: 1, borderRightColor: skin.borderStrong }}
        >
          {/* The face row starts a DM, and a DM started from here would be an
              OG conversation. It stays inside OG (Nat 2026-08-03). */}
          {!wholeHive && (communityRoom || railPeople.length > 0) && (
            <View style={{ borderBottomWidth: 1, borderBottomColor: skin.border }}>
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
                {/* HIVE-Wide rides first, your own HIVE right beside it, so the
                    two doors are the first two things in the rail. Nat,
                    2026-08-11, after the same swap in Settings'
                    WhoCanSeeYouToggle: it goes big (HIVE-Wide) to medium
                    (the HIVE you're in) to small (individual members) —
                    HIVE-Wide is always first. */}
                <View style={{ width: '25%', alignItems: 'center' }}>
                  <HiveWideBubble isActive={showHiveWide} onPress={openHiveWide} />
                </View>
                {communityRoom ? (
                  <View key={communityRoom.id} style={{ width: '25%', alignItems: 'center' }}>
                    <RoomBubble
                      room={communityRoom}
                      currentUserId={profile?.id}
                      hiveName={hiveName}
                      isActive={selectedRoom?.id === communityRoom.id}
                      onPress={() => openRoom(communityRoom)}
                    />
                  </View>
                ) : null}
                {/* Every member of the HIVE, you included — `handleStartDM`
                    knows what to do with your own face. */}
                {railPeople.map((member) => (
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
          {showHiveWide ? (
            hiveWideRoom ? (
              <RoomChatView
                key={hiveWideRoom.id}
                room={hiveWideRoom as unknown as RoomWithData}
                onBack={() => setShowHiveWide(false)}
                hideBackButton
              />
            ) : (
              <HiveWideRoomView
                hiveName={hiveName}
                onBack={() => setShowHiveWide(false)}
                hideBackButton
              />
            )
          ) : selectedRoom ? (
            <RoomChatView
              key={selectedRoom.id}
              room={selectedRoom}
              startCustomizing={customizeRoomOnOpen}
              onBack={handleBackFromRoom}
              hideBackButton
            />
          ) : (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: skin.card }}>
              <Text style={{ fontSize: 44 }}>🍯</Text>
              <Text
                style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }}
                className="text-base mt-3"
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

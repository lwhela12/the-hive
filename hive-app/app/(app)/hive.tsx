import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Image, useWindowDimensions, Pressable, Linking, Modal, TextInput, Alert } from 'react-native';
import Svg, { Path, Text as SvgText, TextPath, Defs } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useHiveDataQuery } from '../../lib/hooks/useHiveDataQuery';
import { useWishes } from '../../lib/hooks/useWishes';
import { QueenBeeCard } from '../../components/hive/QueenBeeCard';
import { WishCard } from '../../components/hive/WishCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { HoneyPotDisplay } from '../../components/hive/HoneyPotDisplay';
import {
  QueenBeeSealsSkeleton,
  QueenBeeCardSkeleton,
  EventsListSkeleton,
  HoneyPotSkeleton,
  WishSectionSkeleton,
} from '../../components/hive/skeletons';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { Avatar } from '../../components/ui/Avatar';
import { formatDateShort, formatDateLong, formatTime, parseAmericanDate } from '../../lib/dateUtils';
import type { Profile, Wish, WishGranter, MonthlyHighlight, Event } from '../../types';

type WishTab = 'open' | 'granted';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter: Profile })[];
};

export default function HiveScreen() {
  const { profile, communityId } = useAuth();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;

  // Responsive seal sizing - smaller on mobile
  const sealSize = width < 500 ? Math.floor((width - 80) / 3) : 160;
  const arcStart = Math.floor(sealSize * 0.19);
  const arcEnd = sealSize - arcStart;
  const arcY = Math.floor(sealSize * 0.5);
  const arcRadius = Math.floor(sealSize * 0.31);
  const fontSize = width < 500 ? 11 : 13;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWish, setSelectedWish] = useState<WishWithGranters | null>(null);
  const [wishTab, setWishTab] = useState<WishTab>('open');
  const [showHighlightsModal, setShowHighlightsModal] = useState(false);
  const [newHighlight, setNewHighlight] = useState('');
  const [savingHighlight, setSavingHighlight] = useState(false);

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  // Use the optimized hive data hook (React Query with caching)
  const {
    queenBees,
    fallbackAdmin,
    publicWishes,
    grantedWishes,
    upcomingEvents,
    honeyPotBalance,
    nextMeeting,
    isLoading,
    loading,
    refetch,
  } = useHiveDataQuery(communityId ?? undefined, profile?.id);

  // For granting wishes
  const { grantWish } = useWishes();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleAddHighlight = async () => {
    if (!newHighlight.trim() || !queenBees.currentMonth || !communityId) return;

    setSavingHighlight(true);
    try {
      const currentHighlights = queenBees.currentMonth.highlights || [];
      const maxOrder = currentHighlights.length > 0
        ? Math.max(...currentHighlights.map(h => h.display_order))
        : 0;

      const { error } = await supabase.from('monthly_highlights').insert({
        queen_bee_id: queenBees.currentMonth.id,
        community_id: communityId,
        highlight: newHighlight.trim(),
        display_order: maxOrder + 1,
        created_by: profile?.id,
      });

      if (error) throw error;

      setNewHighlight('');
      await refetch();
    } catch (error) {
      console.error('Error adding highlight:', error);
      Alert.alert('Error', 'Failed to add highlight');
    } finally {
      setSavingHighlight(false);
    }
  };

  const handleDeleteHighlight = async (highlightId: string) => {
    try {
      const { error } = await supabase
        .from('monthly_highlights')
        .delete()
        .eq('id', highlightId);

      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error('Error deleting highlight:', error);
      Alert.alert('Error', 'Failed to delete highlight');
    }
  };

  // Helper to format ISO date to MM-DD-YYYY for display in input
  const formatDateForInput = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-');
    return `${month}-${day}-${year}`;
  };

  // Open event modal for editing
  const openEditEvent = (event: Event) => {
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventDate(formatDateForInput(event.event_date));
    setEventTime(event.event_time || '');
    setEventDescription(event.description || '');
    setEventLocation(event.location || '');
    setShowEventModal(true);
  };

  // Open event modal for creating
  const openCreateEvent = () => {
    setEditingEvent(null);
    setEventTitle('');
    setEventDate('');
    setEventTime('');
    setEventDescription('');
    setEventLocation('');
    setShowEventModal(true);
  };

  // Close event modal and reset state
  const closeEventModal = () => {
    setShowEventModal(false);
    setEditingEvent(null);
    setEventTitle('');
    setEventDate('');
    setEventTime('');
    setEventDescription('');
    setEventLocation('');
  };

  const saveEvent = async () => {
    if (!eventTitle || !eventDate || !communityId) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    // Convert American date format to ISO for storage
    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      Alert.alert('Error', 'Please enter date in MM-DD-YYYY format');
      return;
    }

    setSavingEvent(true);
    try {
      if (editingEvent) {
        // Update existing event
        const { error } = await supabase
          .from('events')
          .update({
            title: eventTitle,
            event_date: eventDateIso,
            event_time: eventTime || null,
            description: eventDescription || null,
            location: eventLocation || null,
          })
          .eq('id', editingEvent.id);

        if (error) throw error;
      } else {
        // Create new event
        const { error } = await supabase.from('events').insert({
          title: eventTitle,
          event_date: eventDateIso,
          event_time: eventTime || null,
          description: eventDescription || null,
          location: eventLocation || null,
          event_type: 'custom',
          created_by: profile?.id,
          community_id: communityId,
        });

        if (error) throw error;
      }

      closeEventModal();
      await refetch();
    } catch (error) {
      console.error('Error saving event:', error);
      Alert.alert('Error', `Failed to ${editingEvent ? 'update' : 'create'} event`);
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async () => {
    if (!editingEvent) return;

    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', editingEvent.id);

              if (error) throw error;

              closeEventModal();
              await refetch();
            } catch (error) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete event');
            }
          },
        },
      ]
    );
  };

  // Handle grant wish
  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await refetch();
    }
    return result;
  };

  // Show wish detail fullscreen
  if (selectedWish) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <WishDetail
          wish={selectedWish}
          onClose={() => setSelectedWish(null)}
          onGrant={handleGrantWish}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout && (
        <AppHeader
          title="HIVE"
          onMenuPress={() => setDrawerOpen(true)}
        />
      )}

      {/* Navigation Drawer */}
      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mode="navigation"
        />
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-4"
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Queen Bee Seals with Details */}
        {loading.queenBees ? (
          <QueenBeeSealsSkeleton />
        ) : (
          (() => {
            const avatarSize = Math.floor(sealSize * 0.4);
            const columnWidth = sealSize + 8; // seal width plus small margin

            const renderSealColumn = (
              label: string,
              profile: Profile | null,
              arcId: string,
              details: React.ReactNode
            ) => {
              const displayProfile = profile || fallbackAdmin;
              return (
                <View className="items-center" style={{ width: columnWidth }}>
                  {/* Seal */}
                  <View style={{ width: sealSize, height: sealSize }}>
                    <Image
                      source={require('../../assets/SIMPLIFIED SEAL 2.png')}
                      style={{ width: sealSize, height: sealSize, position: 'absolute' }}
                      resizeMode="contain"
                    />
                    <View style={{
                      position: 'absolute',
                      top: (sealSize - avatarSize) / 2 - sealSize * 0.015,
                      left: (sealSize - avatarSize) / 2
                    }}>
                      {displayProfile && (
                        <Avatar name={displayProfile.name} url={displayProfile.avatar_url} size={avatarSize} />
                      )}
                    </View>
                    <Svg width={sealSize} height={sealSize} style={{ position: 'absolute' }}>
                      <Defs>
                        <Path
                          id={arcId}
                          d={`M ${arcStart},${arcY} A ${arcRadius},${arcRadius} 0 0,0 ${arcEnd},${arcY}`}
                        />
                      </Defs>
                      <SvgText fill="#333" fontSize={fontSize} fontWeight="bold">
                        <TextPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                          {label}
                        </TextPath>
                      </SvgText>
                    </Svg>
                  </View>
                  {/* Details */}
                  <View className="mt-2 items-center" style={{ width: columnWidth }}>
                    {details}
                  </View>
                </View>
              );
            };

            return (
              <View className="flex-row justify-evenly py-4 border-b border-gray-100">
                {renderSealColumn(
                  'Last Month',
                  queenBees.lastMonth?.user || null,
                  'lastMonthArc',
                  <>
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal text-center" numberOfLines={1}>
                      {queenBees.lastMonth?.user?.name || fallbackAdmin?.name || 'TBD'}
                    </Text>
                    {queenBees.lastMonth?.highlights && queenBees.lastMonth.highlights.length > 0 ? (
                      queenBees.lastMonth.highlights.slice(0, 2).map((h) => (
                        <Text key={h.id} style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/60 text-center" numberOfLines={2}>
                          {h.highlight}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 italic text-center">
                        No highlights
                      </Text>
                    )}
                  </>
                )}
                {renderSealColumn(
                  'Current',
                  queenBees.currentMonth?.user || null,
                  'currentArc',
                  <>
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal text-center" numberOfLines={1}>
                      {queenBees.currentMonth?.user?.name || fallbackAdmin?.name || 'TBD'}
                    </Text>
                    {queenBees.currentMonth?.project_title && (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/70 text-center" numberOfLines={2}>
                        {queenBees.currentMonth.project_title}
                      </Text>
                    )}
                    {queenBees.currentMonth?.highlights && queenBees.currentMonth.highlights.length > 0 ? (
                      queenBees.currentMonth.highlights.slice(0, 1).map((h) => (
                        <Text key={h.id} style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/60 text-center" numberOfLines={2}>
                          {h.highlight}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 italic text-center">
                        Updates soon
                      </Text>
                    )}
                  </>
                )}
                {renderSealColumn(
                  'Next Month',
                  queenBees.nextMonth?.user || null,
                  'nextMonthArc',
                  <>
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal text-center" numberOfLines={1}>
                      {queenBees.nextMonth?.user?.name || 'TBD'}
                    </Text>
                    {nextMeeting && (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/70 text-center">
                        Next: {formatDateShort(nextMeeting.event_date)}
                      </Text>
                    )}
                  </>
                )}
              </View>
            );
          })()
        )}

        {/* Main Content */}
        <View className="p-4">

        {/* Queen Bee Section */}
        {loading.queenBees ? (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
                This Month's Queen Bee 👑
              </Text>
            </View>
            <QueenBeeCardSkeleton />
          </View>
        ) : queenBees.currentMonth ? (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
                This Month's Queen Bee 👑
              </Text>
              <Pressable
                onPress={() => setShowHighlightsModal(true)}
                className="bg-cream px-3 py-1 rounded-lg active:bg-gold-light"
              >
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                  Edit Notes
                </Text>
              </Pressable>
            </View>
            <QueenBeeCard queenBee={queenBees.currentMonth} />
          </View>
        ) : null}

        {/* Upcoming Events */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              Upcoming Events
            </Text>
            <Pressable
              onPress={openCreateEvent}
              className="bg-cream px-3 py-1 rounded-lg active:bg-gold-light"
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                + Add Event
              </Text>
            </Pressable>
          </View>
          {loading.events ? (
            <EventsListSkeleton />
          ) : upcomingEvents.length > 0 ? (
            <View className="bg-white rounded-xl shadow-sm overflow-hidden">
              {upcomingEvents.map((event, index) => (
                <Pressable
                  key={event.id}
                  onPress={() => openEditEvent(event)}
                  className={`p-4 active:bg-gray-50 ${index < upcomingEvents.length - 1 ? 'border-b border-cream' : ''}`}
                >
                  <View className="flex-row items-start">
                    <Text className="text-2xl mr-3">
                      {event.event_type === 'birthday' ? '🎂' :
                       event.event_type === 'meeting' ? '📅' :
                       event.event_type === 'queen_bee' ? '👑' : '📌'}
                    </Text>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{event.title}</Text>
                      <View className="flex-row flex-wrap items-center mt-1">
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                          {formatDateShort(event.event_date)}
                        </Text>
                        {event.event_time && (
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                            {' '}at {formatTime(event.event_time)}
                          </Text>
                        )}
                      </View>
                      {event.location && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(event.location!)}`);
                          }}
                          className="flex-row items-center mt-1 active:opacity-60"
                        >
                          <Text className="text-xs mr-1">📍</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-gold underline">
                            {event.location}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                  {event.meet_link && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(event.meet_link!);
                      }}
                      className="mt-3 bg-gold/10 py-2 px-4 rounded-lg flex-row items-center justify-center active:bg-gold/20"
                    >
                      <Text className="text-base mr-2">📹</Text>
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">
                        Join Google Meet
                      </Text>
                    </Pressable>
                  )}
                </Pressable>
              ))}
            </View>
          ) : (
            <View className="bg-white rounded-xl p-6 shadow-sm items-center">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                No upcoming events
              </Text>
            </View>
          )}
        </View>

        {/* Honey Pot */}
        <View className="mb-6">
          {loading.honeyPot ? (
            <HoneyPotSkeleton />
          ) : (
            <HoneyPotDisplay balance={honeyPotBalance} />
          )}
        </View>

        {/* Community Wishes */}
        <View className="mb-6">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
            Community Wishes
          </Text>

          {loading.publicWishes && loading.grantedWishes ? (
            <WishSectionSkeleton />
          ) : (
            <>
              {/* Tabs */}
              <View className="flex-row mb-3 bg-cream/50 rounded-lg p-1">
                <Pressable
                  onPress={() => setWishTab('open')}
                  className={`flex-1 py-2 rounded-md ${
                    wishTab === 'open' ? 'bg-white shadow-sm' : ''
                  }`}
                >
                  <Text
                    style={{ fontFamily: wishTab === 'open' ? 'Lato_700Bold' : 'Lato_400Regular' }}
                    className={`text-center text-sm ${
                      wishTab === 'open' ? 'text-charcoal' : 'text-charcoal/60'
                    }`}
                  >
                    Open ({publicWishes.length})
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setWishTab('granted')}
                  className={`flex-1 py-2 rounded-md ${
                    wishTab === 'granted' ? 'bg-white shadow-sm' : ''
                  }`}
                >
                  <Text
                    style={{ fontFamily: wishTab === 'granted' ? 'Lato_700Bold' : 'Lato_400Regular' }}
                    className={`text-center text-sm ${
                      wishTab === 'granted' ? 'text-charcoal' : 'text-charcoal/60'
                    }`}
                  >
                    Granted ({grantedWishes.length})
                  </Text>
                </Pressable>
              </View>

              {/* Open Wishes */}
              {wishTab === 'open' && (
                <>
                  {publicWishes.length === 0 ? (
                    <View className="bg-white rounded-xl p-6 shadow-sm items-center">
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                        No open wishes yet
                      </Text>
                    </View>
                  ) : (
                    publicWishes.map((wish) => (
                      <WishCard
                        key={wish.id}
                        wish={wish}
                        onPress={() => setSelectedWish(wish)}
                      />
                    ))
                  )}
                </>
              )}

              {/* Granted Wishes */}
              {wishTab === 'granted' && (
                <>
                  {grantedWishes.length === 0 ? (
                    <View className="bg-white rounded-xl p-6 shadow-sm items-center">
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                        No granted wishes yet
                      </Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-sm mt-1">
                        Wishes that are fulfilled will appear here
                      </Text>
                    </View>
                  ) : (
                    grantedWishes.map((wish) => (
                      <WishCard
                        key={wish.id}
                        wish={wish}
                        onPress={() => setSelectedWish(wish)}
                      />
                    ))
                  )}
                </>
              )}
            </>
          )}
        </View>

        </View>
      </ScrollView>

      {/* Queen Bee Highlights Modal */}
      <Modal
        visible={showHighlightsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHighlightsModal(false)}
      >
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Pressable onPress={() => setShowHighlightsModal(false)}>
              <Text className="text-gray-500 text-base">Close</Text>
            </Pressable>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              Queen Bee Notes
            </Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView className="flex-1 p-4">
            {queenBees.currentMonth && (
              <>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 mb-4">
                  Add highlights and notes for {queenBees.currentMonth.user?.name}'s month as Queen Bee.
                </Text>

                {/* Existing highlights */}
                {queenBees.currentMonth.highlights && queenBees.currentMonth.highlights.length > 0 ? (
                  <View className="mb-6">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                      Current Notes
                    </Text>
                    {queenBees.currentMonth.highlights.map((highlight) => (
                      <View
                        key={highlight.id}
                        className="flex-row items-center bg-cream/50 rounded-lg p-3 mb-2"
                      >
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="flex-1 text-charcoal">
                          {highlight.highlight}
                        </Text>
                        <Pressable
                          onPress={() => handleDeleteHighlight(highlight.id)}
                          className="ml-2 p-2"
                        >
                          <Text className="text-red-500">✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View className="bg-cream/30 rounded-lg p-4 mb-6">
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                      No notes yet
                    </Text>
                  </View>
                )}

                {/* Add new highlight */}
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                  Add Note
                </Text>
                <TextInput
                  value={newHighlight}
                  onChangeText={setNewHighlight}
                  placeholder="Enter a highlight or note..."
                  multiline
                  numberOfLines={3}
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-3"
                  style={{ textAlignVertical: 'top', minHeight: 80 }}
                />
                <Pressable
                  onPress={handleAddHighlight}
                  disabled={savingHighlight || !newHighlight.trim()}
                  className={`bg-gold py-3 rounded-lg items-center ${
                    savingHighlight || !newHighlight.trim() ? 'opacity-50' : 'active:bg-gold/80'
                  }`}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                    {savingHighlight ? 'Adding...' : 'Add Note'}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Add/Edit/View Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            {(() => {
              const isCreator = !editingEvent || editingEvent.created_by === profile?.id;
              const isViewOnly = editingEvent && !isCreator;

              return (
                <>
                  <View className="flex-row items-center justify-between mb-4">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xl text-charcoal">
                      {isViewOnly ? 'Event Details' : editingEvent ? 'Edit Event' : 'Add Event'}
                    </Text>
                    {editingEvent && isCreator && (
                      <Pressable onPress={deleteEvent} className="p-2">
                        <Text className="text-red-500 text-sm">Delete</Text>
                      </Pressable>
                    )}
                  </View>

                  {isViewOnly ? (
                    // Read-only view for non-creators
                    <>
                      <View className="mb-4">
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Title</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-base text-charcoal">{eventTitle}</Text>
                      </View>
                      <View className="flex-row mb-4">
                        <View className="flex-1 mr-4">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Date</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-charcoal">{eventDate}</Text>
                        </View>
                        {eventTime && (
                          <View>
                            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Time</Text>
                            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-charcoal">{eventTime}</Text>
                          </View>
                        )}
                      </View>
                      {eventLocation && (
                        <View className="mb-4">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Location</Text>
                          <Pressable
                            onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(eventLocation)}`)}
                            className="active:opacity-60"
                          >
                            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-gold underline">{eventLocation}</Text>
                          </Pressable>
                        </View>
                      )}
                      {eventDescription && (
                        <View className="mb-4">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Description</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-charcoal">{eventDescription}</Text>
                        </View>
                      )}
                      {editingEvent?.meet_link && (
                        <Pressable
                          onPress={() => Linking.openURL(editingEvent.meet_link!)}
                          className="mb-4 bg-gold/10 py-3 px-4 rounded-lg flex-row items-center justify-center active:bg-gold/20"
                        >
                          <Text className="text-base mr-2">📹</Text>
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">Join Google Meet</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={closeEventModal}
                        className="bg-gray-200 py-3 rounded-lg"
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal">Close</Text>
                      </Pressable>
                    </>
                  ) : (
                    // Editable view for creators
                    <>
                      <TextInput
                        placeholder="Event Title"
                        value={eventTitle}
                        onChangeText={setEventTitle}
                        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-3"
                      />
                      <View className="flex-row mb-3">
                        <TextInput
                          placeholder="Date (MM-DD-YYYY)"
                          value={eventDate}
                          onChangeText={setEventDate}
                          className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-base mr-2"
                        />
                        <TextInput
                          placeholder="Time (HH:MM)"
                          value={eventTime}
                          onChangeText={setEventTime}
                          className="w-28 border border-gray-300 rounded-lg px-4 py-3 text-base"
                        />
                      </View>
                      <TextInput
                        placeholder="Location (optional)"
                        value={eventLocation}
                        onChangeText={setEventLocation}
                        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-3"
                      />
                      <TextInput
                        placeholder="Description (optional)"
                        value={eventDescription}
                        onChangeText={setEventDescription}
                        multiline
                        numberOfLines={3}
                        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
                        style={{ textAlignVertical: 'top', minHeight: 80 }}
                      />

                      <View className="flex-row">
                        <Pressable
                          onPress={closeEventModal}
                          className="flex-1 bg-gray-200 py-3 rounded-lg mr-2"
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal">Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={saveEvent}
                          disabled={savingEvent}
                          className={`flex-1 bg-gold py-3 rounded-lg ${savingEvent ? 'opacity-50' : 'active:bg-gold/80'}`}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-white">
                            {savingEvent ? 'Saving...' : editingEvent ? 'Save' : 'Create'}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

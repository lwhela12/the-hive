import { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, Image, useWindowDimensions, Pressable, Linking, Modal, TextInput, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceMicButton } from '../../components/ui/VoiceMicButton';
import Svg, { Polygon } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useHiveDataQuery } from '../../lib/hooks/useHiveDataQuery';
import { useWishes } from '../../lib/hooks/useWishes';
import { WishCard } from '../../components/hive/WishCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import {
  EventsListSkeleton,
  WishSectionSkeleton,
} from '../../components/hive/skeletons';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { formatDateShort, formatDateLong, formatTime, parseAmericanDate } from '../../lib/dateUtils';
import type { Profile, Wish, WishGranter, Event } from '../../types';

type WishTab = 'open' | 'granted';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter: Profile })[];
};

const INITIAL_EVENTS_SHOWN = 3;

const CALENDAR_DURATION_MS = 60 * 60 * 1000;

const getEventStartDate = (event: Event) => {
  const [year, month, day] = event.event_date.split('-').map(Number);
  const [hour = 9, minute = 0] = (event.event_time || '09:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
};

const formatGoogleCalendarDate = (date: Date) => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const formatIcsDate = (date: Date) => formatGoogleCalendarDate(date);

const escapeIcsText = (value = '') => value
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\n/g, '\\n');

const getCalendarDescription = (event: Event) => {
  return [
    event.description,
    event.meet_link ? `Join Google Meet: ${event.meet_link}` : null,
  ].filter(Boolean).join('\n\n');
};

const createCalendarLinks = (event: Event) => {
  const start = getEventStartDate(event);
  const end = new Date(start.getTime() + CALENDAR_DURATION_MS);
  const description = getCalendarDescription(event);

  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(end)}`,
    details: description,
    location: event.location || '',
  });

  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: description,
    location: event.location || '',
  });

  return {
    google: `https://calendar.google.com/calendar/render?${googleParams.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`,
  };
};

const createIcsContent = (event: Event) => {
  const start = getEventStartDate(event);
  const end = new Date(start.getTime() + CALENDAR_DURATION_MS);
  const timestamp = formatIcsDate(new Date());
  const uid = `${event.id}@the-hive.app`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HIVE//Community Event//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(getCalendarDescription(event))}`,
    `LOCATION:${escapeIcsText(event.location || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

const downloadIcsFile = (event: Event) => {
  const icsContent = createIcsContent(event);
  const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hive-event';
  const fileName = `${safeTitle}.ics`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const dataUrl = `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`;
  Linking.openURL(dataUrl);
};

const openAddToCalendar = (event: Event) => {
  const links = createCalendarLinks(event);

  if (typeof window !== 'undefined' && window.confirm) {
    if (window.confirm('Open Google Calendar? Press Cancel to download a calendar file instead.')) {
      Linking.openURL(links.google);
    } else {
      downloadIcsFile(event);
    }
    return;
  }

  Alert.alert('Add to Calendar', event.title, [
    { text: 'Google Calendar', onPress: () => Linking.openURL(links.google) },
    { text: 'Outlook Calendar', onPress: () => Linking.openURL(links.outlook) },
    { text: 'Apple / Other Calendar', onPress: () => downloadIcsFile(event) },
    { text: 'Cancel', style: 'cancel' },
  ]);
};

function EventsList({ events, onEditEvent }: { events: Event[]; onEditEvent: (event: Event) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? events : events.slice(0, INITIAL_EVENTS_SHOWN);
  const hasMore = events.length > INITIAL_EVENTS_SHOWN;

  return (
    <View className="bg-white rounded-xl shadow-sm overflow-hidden">
      {visibleEvents.map((event, index) => (
        <Pressable
          key={event.id}
          onPress={() => onEditEvent(event)}
          className={`p-4 active:bg-gray-50 ${index < visibleEvents.length - 1 || (hasMore && !expanded) ? 'border-b border-cream' : ''}`}
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
              className="mt-3 self-start bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10"
            >
              <Text className="text-xs mr-1.5">📹</Text>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                Join Google Meet
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              openAddToCalendar(event);
            }}
            className="mt-3 self-start bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10"
          >
            <Text className="text-xs mr-1.5">📅</Text>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
              Add to Calendar
            </Text>
          </Pressable>
        </Pressable>
      ))}
      {hasMore && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          className="py-3 items-center active:bg-gray-50"
        >
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
            {expanded ? 'Show less' : `Show all ${events.length} events`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const DAILY_QUESTION = "What's one thing you've been putting off that could change everything if you just started?";

const PLACEHOLDER_ANSWERS = [
  { name: 'Charlee', initials: 'CH', avatar: null, answer: 'Learning how to properly meal-prep on Sundays so weeknights feel effortless.', color: '#f9dcc4' },
  { name: 'Maya', initials: 'MA', avatar: null, answer: 'Writing the first chapter of the novel I keep talking about!', color: '#d4e8d0' },
  { name: 'Sara', initials: 'SA', avatar: null, answer: 'Setting up a consistent morning routine — even just 15 minutes of movement.', color: '#d6e4f7' },
];

const PLACEHOLDER_ACTIVITY = [
  { emoji: '🌟', text: 'Sarah posted a new wish: help planning a veggie garden', time: '2h ago', read: false },
  { emoji: '✅', text: "Maya's wish for recipe ideas was granted by Charlee", time: '5h ago', read: false },
  { emoji: '📅', text: 'New event added: May Book Club — May 18 at 7pm', time: '1d ago', read: true },
  { emoji: '👋', text: 'Leila shared an introduction on the Message Board', time: '2d ago', read: true },
  { emoji: '🍯', text: 'Honey Pot updated by Treasurer', time: '3d ago', read: true },
];

function HexShortcut({ emoji, label, sublabel, onPress }: {
  emoji: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1 }} className="active:opacity-70">
      <View style={{ width: 72, height: 64, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={72} height={64} viewBox="0 0 72 64" style={{ position: 'absolute' }}>
          <Polygon
            points="36,2 70,20 70,44 36,62 2,44 2,20"
            fill="#fdf3dc"
            stroke="rgba(222,193,129,0.6)"
            strokeWidth={1.5}
          />
        </Svg>
        <Text style={{ fontSize: 26, lineHeight: 30 }}>{emoji}</Text>
      </View>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', marginTop: 5, textAlign: 'center' }}>{label}</Text>
      {sublabel ? (
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', marginTop: 2, textAlign: 'center' }}>{sublabel}</Text>
      ) : null}
    </Pressable>
  );
}

export default function HiveScreen() {
  const { profile, communityId, communityRole } = useAuth();
  const router = useRouter();
  const { totalUnread: unreadDMCount } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;

  const [refreshing, setRefreshing] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [myAnswer, setMyAnswer] = useState('');
  const [mySubmittedAnswer, setMySubmittedAnswer] = useState('');

  const handleSubmitAnswer = () => {
    const text = myAnswer.trim();
    if (!text) return;
    setMySubmittedAnswer(text);
    setMyAnswer('');
    setShowAnswerModal(false);
  };
  const [selectedWish, setSelectedWish] = useState<WishWithGranters | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [wishTab, setWishTab] = useState<WishTab>('open');

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // Member carousel state
  const [carouselMembers, setCarouselMembers] = useState<{ id: string; name: string; avatar_url?: string | null; role: string }[]>([]);
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; avatar_url?: string | null; role: string } | null>(null);

  useEffect(() => {
    if (!communityId) return;
    supabase
      .from('community_memberships')
      .select('user_id, role, created_at, profiles(id, name, avatar_url)')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setCarouselMembers(
            data.map((m: any) => ({
              id: m.profiles?.id ?? m.user_id,
              name: m.profiles?.name ?? '',
              avatar_url: m.profiles?.avatar_url ?? null,
              role: m.role ?? 'member',
            })).filter(m => m.name)
          );
        }
      });
  }, [communityId]);

  // Use the optimized hive data hook (React Query with caching)
  const {
    publicWishes,
    grantedWishes,
    upcomingEvents,
    honeyPotBalance,
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
    setEventError(null);
    setEventTitle('');
    setEventDate('');
    setEventTime('');
    setEventDescription('');
    setEventLocation('');
  };

  const saveEvent = async () => {
    setEventError(null);
    if (!eventTitle.trim()) {
      setEventError('Please enter an event title.');
      return;
    }
    if (!eventDate) {
      setEventError('Please select a date.');
      return;
    }
    if (!communityId) {
      setEventError('No community found. Please refresh and try again.');
      return;
    }

    // Convert American date format to ISO for storage
    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      setEventError('Invalid date format. Please pick a date using the calendar.');
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
    } catch (error: any) {
      console.error('Error saving event:', error);
      const msg = error?.message || '';
      if (msg.includes('row-level security') || msg.includes('policy') || msg.includes('permission')) {
        setEventError('Permission denied. Ask your admin to apply the latest database update.');
      } else {
        setEventError(`Failed to ${editingEvent ? 'update' : 'create'} event. Please try again.`);
      }
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async () => {
    if (!editingEvent || !communityId) return;

    const doDelete = async () => {
      try {
        const { error } = await supabase
          .from('events')
          .delete()
          .eq('id', editingEvent.id)
          .eq('community_id', communityId);

        if (error) throw error;

        closeEventModal();
        await refetch();
      } catch (error) {
        console.error('Error deleting event:', error);
        Alert.alert('Error', 'Failed to delete event');
      }
    };

    // Use window.confirm on web, Alert.alert on native
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Are you sure you want to delete this event?')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Delete Event',
        'Are you sure you want to delete this event?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
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

  const handleEditWishSave = async () => {
    await refetch();
    setEditingWish(null);
    setSelectedWish(null);
  };

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId || wish.user_id !== profile.id) return;

    const deleteWish = async () => {
      const { error } = await supabase
        .from('wishes')
        .delete()
        .eq('id', wish.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        Alert.alert('Error', 'Failed to delete wish. Please try again.');
        return;
      }

      await refetch();
      if (selectedWish?.id === wish.id) {
        setSelectedWish(null);
      }
    };

    const message = `Delete this wish?\n\n"${wish.description}"`;

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        deleteWish();
      }
      return;
    }

    Alert.alert('Delete Wish', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteWish },
    ]);
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
          unreadDMCount={unreadDMCount}
        />
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-4"
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Combined Daily Question + Member Answer Bubbles */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(189,147,72,0.45)', backgroundColor: '#fffbf0' }}>
          <View style={{ flexDirection: 'row' }}>

            {/* Left: fixed question panel */}
            <View
              style={{
                width: useMobileLayout ? 138 : 176,
                padding: 14,
                borderRightWidth: 1,
                borderRightColor: '#c49a3c',
                justifyContent: 'center',
                minHeight: 176,
              }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348', letterSpacing: 0.9, marginBottom: 7 }}>
                ✨ DAILY QUESTION
              </Text>
              <Text
                style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: useMobileLayout ? 12 : 13, color: '#2d2d2d', lineHeight: 18 }}
                numberOfLines={6}
              >
                {DAILY_QUESTION}
              </Text>
            </View>

            {/* Right: scrolling member answer bubbles */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}
            >
              {[...carouselMembers].sort((a, b) => (a.id === profile?.id ? -1 : b.id === profile?.id ? 1 : 0)).map((member, i) => {
                const isMe = member.id === profile?.id;
                const firstName = member.name.split(' ')[0];
                // non-me members: first 3 get placeholder answers; me: never auto-answered
                const nonMeIndex = isMe ? -1 : [...carouselMembers].filter(m => m.id !== profile?.id).indexOf(member);
                const placeholderAnswer = !isMe && nonMeIndex < PLACEHOLDER_ANSWERS.length ? PLACEHOLDER_ANSWERS[nonMeIndex] : null;
                const hasAnswered = !!placeholderAnswer;
                const imgOpacity = isMe ? 1 : hasAnswered ? 1 : 0.45;
                return (
                  <Pressable
                    key={member.id}
                    onPress={isMe ? () => setShowAnswerModal(true) : () => setSelectedMember(member)}
                    style={{ width: 74, alignItems: 'center' }}
                  >
                    {/* Avatar circle */}
                    <View style={{
                      borderRadius: 28,
                      borderWidth: isMe ? 2.5 : 2,
                      borderColor: isMe ? '#bd9348' : hasAnswered ? '#bd9348' : 'rgba(222,193,129,0.4)',
                      padding: 2.5,
                      marginBottom: 5,
                      backgroundColor: 'white',
                      shadowColor: '#000',
                      shadowOpacity: isMe || hasAnswered ? 0.1 : 0.04,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: isMe || hasAnswered ? 2 : 1,
                    }}>
                      {member.avatar_url ? (
                        <Image
                          source={{ uri: member.avatar_url }}
                          style={{ width: 44, height: 44, borderRadius: 22, opacity: imgOpacity }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8e3da', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden', opacity: imgOpacity }}>
                          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#b8b0a4', position: 'absolute', top: 8 }} />
                          <View style={{ width: 32, height: 21, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#b8b0a4' }} />
                        </View>
                      )}
                    </View>

                    {/* Name / Answer label */}
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: isMe ? '#bd9348' : hasAnswered ? '#2d2d2d' : '#b0a898', textAlign: 'center', marginBottom: 5 }} numberOfLines={1}>
                      {isMe ? (mySubmittedAnswer ? 'Edit' : 'Answer') : firstName}
                    </Text>

                    {/* Answer snippet or placeholder */}
                    {isMe && mySubmittedAnswer ? (
                      <View style={{ backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#c49a3c', padding: 6, width: 74 }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 9, color: '#4b5563', lineHeight: 13 }} numberOfLines={4}>
                          {mySubmittedAnswer}
                        </Text>
                      </View>
                    ) : hasAnswered ? (
                      <View style={{ backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#c49a3c', padding: 6, width: 74 }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 9, color: '#4b5563', lineHeight: 13 }} numberOfLines={4}>
                          {placeholderAnswer.answer}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: isMe ? 'rgba(189,147,72,0.4)' : 'rgba(222,193,129,0.25)', borderStyle: 'dashed', padding: 5, width: 74, alignItems: 'center' }}>
                        <Text style={{ fontSize: 13 }}>{isMe ? '✍️' : '💭'}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

          </View>
        </View>

        {/* Main Content */}
        <View className="p-4">

        {/* Activity Feed + Upcoming Events — side by side on wide screens */}
        <View style={{ flexDirection: useMobileLayout ? 'column' : 'row', gap: 12, marginBottom: 16 }}>

          {/* Activity Feed */}
          <View style={{ flex: 1, marginBottom: useMobileLayout ? 0 : 0 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 10 }}>
              Activity
            </Text>
            <View style={{
              backgroundColor: 'white',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#c49a3c',
              shadowColor: '#c49a3c',
              shadowOpacity: 0.18,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
              overflow: 'hidden',
              height: 280,
            }}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {PLACEHOLDER_ACTIVITY.map((item, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      padding: 14,
                      borderBottomWidth: i < PLACEHOLDER_ACTIVITY.length - 1 ? 1 : 0,
                      borderBottomColor: '#f3f0ea',
                      backgroundColor: item.read ? 'white' : '#fffef5',
                    }}
                  >
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: item.read ? '#f5f3ee' : '#fdf3dc',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      flexShrink: 0,
                    }}>
                      <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: item.read ? 'Lato_400Regular' : 'Lato_700Bold', fontSize: 13, color: '#2d2d2d', lineHeight: 18 }}>
                        {item.text}
                      </Text>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                        {item.time}
                      </Text>
                    </View>
                    {!item.read && (
                      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#bd9348', marginTop: 5, marginLeft: 6, flexShrink: 0 }} />
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Upcoming Events */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d' }}>
                Upcoming Events
              </Text>
              <Pressable
                onPress={openCreateEvent}
                style={{ backgroundColor: '#fdf3dc', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>+ Add</Text>
              </Pressable>
            </View>
            <View style={{
              backgroundColor: 'white',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#c49a3c',
              shadowColor: '#c49a3c',
              shadowOpacity: 0.18,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
              overflow: 'hidden',
              height: 280,
            }}>
              {loading.events ? (
                <View style={{ padding: 16 }}><EventsListSkeleton /></View>
              ) : upcomingEvents.length > 0 ? (
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  <EventsList events={upcomingEvents} onEditEvent={openEditEvent} />
                </ScrollView>
              ) : (
                <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', color: '#9ca3af' }}>No upcoming events</Text>
                </View>
              )}
            </View>
          </View>

        </View>

        {/* Hex Shortcuts */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24, paddingHorizontal: 8 }}>
          <HexShortcut
            emoji="🍯"
            label="Honey Pot"
            sublabel={loading.honeyPot ? '...' : `$${honeyPotBalance?.toFixed(0) ?? '0'}`}
            onPress={() => {}}
          />
          <HexShortcut
            emoji="📋"
            label="Message Board"
            onPress={() => router.push('/board')}
          />
          <HexShortcut
            emoji="💬"
            label="Chat"
            onPress={() => router.push('/messages')}
          />
        </View>

        {/* Community Wishes */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 10 }}>
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
                        canEdit={wish.user_id === profile?.id}
                        onEdit={() => setEditingWish(wish)}
                        canDelete={wish.user_id === profile?.id}
                        onDelete={() => handleDeleteWish(wish)}
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
                        canEdit={wish.user_id === profile?.id}
                        onEdit={() => setEditingWish(wish)}
                        canDelete={wish.user_id === profile?.id}
                        onDelete={() => handleDeleteWish(wish)}
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

      {/* Add/Edit/View Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            {(() => {
              const isCreator = !editingEvent || editingEvent.created_by === profile?.id;
              const isHistorian = communityRole === 'historian';
              const isAdminRole = communityRole === 'admin';
              const canEdit = isCreator || isHistorian || isAdminRole;
              const isViewOnly = editingEvent && !canEdit;

              return (
                <>
                  <View className="flex-row items-center justify-between mb-4">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xl text-charcoal">
                      {isViewOnly ? 'Event Details' : editingEvent ? 'Edit Event' : 'Add Event'}
                    </Text>
                    {editingEvent && canEdit && (
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
                      <View className="mb-3">
                        <EventDatePicker
                          value={eventDate}
                          onChange={setEventDate}
                        />
                      </View>
                      <View className="mb-3">
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Time (optional)</Text>
                        <TextInput
                          placeholder="HH:MM (e.g. 14:30)"
                          value={eventTime}
                          onChangeText={setEventTime}
                          className="border border-gray-300 rounded-lg px-4 py-3 text-base bg-cream"
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

                      {eventError && (
                        <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-red-600 text-sm text-center">
                            {eventError}
                          </Text>
                        </View>
                      )}

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

      <AddWishModal
        visible={!!editingWish}
        onClose={() => setEditingWish(null)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleEditWishSave}
        existingWish={editingWish}
      />

      {/* Daily Question Answer Modal */}
      <Modal visible={showAnswerModal} animationType="slide" transparent onRequestClose={() => setShowAnswerModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 }}>
                ✨ DAILY QUESTION
              </Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 15, color: '#2d2d2d', lineHeight: 22, marginBottom: 20 }}>
                {DAILY_QUESTION}
              </Text>
              {/* Text input + mic */}
              <View style={{ marginBottom: 14, position: 'relative' }}>
                <TextInput
                  value={myAnswer}
                  onChangeText={setMyAnswer}
                  placeholder="Share your answer with the Hive..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  blurOnSubmit={false}
                  onKeyPress={(e: any) => {
                    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                      e.preventDefault?.();
                      handleSubmitAnswer();
                    }
                  }}
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 15,
                    color: '#2d2d2d',
                    borderWidth: 1,
                    borderColor: '#c49a3c',
                    borderRadius: 14,
                    padding: 14,
                    paddingRight: 48,
                    minHeight: 100,
                    textAlignVertical: 'top',
                    backgroundColor: '#fffbf0',
                  }}
                />
                <VoiceMicButton
                  onTranscript={(text) => setMyAnswer(prev => prev ? prev + ' ' + text : text)}
                  size={20}
                  style={{ position: 'absolute', bottom: 10, right: 10 }}
                />
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9ca3af', marginBottom: 14, marginTop: -6 }}>
                Press Enter to send · Shift+Enter for a new line
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => { setShowAnswerModal(false); setMyAnswer(''); }}
                  style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitAnswer}
                  style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: myAnswer.trim() ? 1 : 0.4 }}
                  disabled={!myAnswer.trim()}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>Share with Hive 🐝</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick member peek modal from carousel */}
      {selectedMember && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setSelectedMember(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 }}>
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24 }}>
                <View style={{ borderRadius: 52, borderWidth: 2, borderColor: '#dec181', padding: 3, marginBottom: 12 }}>
                  {selectedMember.avatar_url ? (
                    <Image source={{ uri: selectedMember.avatar_url }} style={{ width: 88, height: 88, borderRadius: 44 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#e8e3da', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                      <View style={{ width: 33, height: 33, borderRadius: 16.5, backgroundColor: '#b8b0a4', position: 'absolute', top: 16 }} />
                      <View style={{ width: 66, height: 44, borderTopLeftRadius: 33, borderTopRightRadius: 33, backgroundColor: '#b8b0a4' }} />
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#2d2d2d' }}>{selectedMember.name}</Text>
                {selectedMember.role !== 'member' && (
                  <View style={{ marginTop: 6, backgroundColor: '#fdf3dc', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', textTransform: 'capitalize' }}>{selectedMember.role}</Text>
                  </View>
                )}
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
                  Visit the Members tab to see their full profile, skills & wishes.
                </Text>
              </View>
              <View style={{ paddingHorizontal: 24 }}>
                <Pressable onPress={() => setSelectedMember(null)} style={{ backgroundColor: '#faf8f3', borderRadius: 14, paddingVertical: 14 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

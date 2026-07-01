import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Image, useWindowDimensions, Pressable, Linking, Modal, TextInput, Alert, ActivityIndicator, Animated } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VoiceMicButton } from '../../components/ui/VoiceMicButton';
import Svg, { Polygon } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useHiveDataQuery } from '../../lib/hooks/useHiveDataQuery';
import { useWishes } from '../../lib/hooks/useWishes';
import { useActivityFeed, type ActivityItem } from '../../lib/hooks/useActivityFeed';
import { useSurveys, type Survey, type SurveyAnswers } from '../../lib/hooks/useSurveys';
import { useCarryForwardContext } from '../../lib/hooks/useCarryForwardContext';
import { SurveyModal } from '../../components/surveys/SurveyModal';
import { WishCard } from '../../components/hive/WishCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { HeaderTabs } from '../../components/ui/HeaderTabs';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import {
  EventsListSkeleton,
  WishSectionSkeleton,
} from '../../components/hive/skeletons';
import { AppHeader } from '../../components/navigation';
import { getQuestionForDate, getTodayQuestion } from '../../lib/dailyQuestions';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { formatDateShort, formatTime, parseAmericanDate } from '../../lib/dateUtils';
import { ConfettiBurst } from '../../components/ui/ConfettiBurst';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { linkWishToHdBoard, unlinkWishFromBoard } from '../../lib/wishBoardLinking';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import { addHomeResetListener } from '../../lib/homeNavigation';
import {
  QUARTERLY_DUES_AMOUNT,
  type DuesPeriod,
  duesTransactionsCoverMember,
  getCurrentDuesPeriod,
  getDuesPeriodStartDate,
  isDuesPeriodStartDay,
} from '../../lib/dues';
import type { Profile, Wish, WishGranter, Event, ActionItem } from '../../types';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter?: Profile })[];
};

type WishStatusTabKey = 'public' | 'granted';
type TodoStatusTabKey = 'open' | 'done';

type HomeTodo = {
  id: string;
  emoji: string;
  title: string;
  detail?: string;
  cta?: string;
  ctaOnPress?: () => void;
  isDone?: boolean;
  completedAt?: string | null;
  onPress?: () => void;
  onToggle?: () => void;
  onLongPress?: () => void;
  onArchive?: () => void;
};

const CALENDAR_DURATION_MS = 2.5 * 60 * 60 * 1000; // 30-min arrival + 2-hour meeting
const getRecentDailyQuestions = (days = 7) => {
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return getQuestionForDate(date);
  });
};

const getEventStartDate = (event: Event) => {
  const [year, month, day] = event.event_date.split('-').map(Number);
  const [hour = 9, minute = 0] = (event.event_time || '09:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
};

const formatGoogleCalendarDate = (date: Date) => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const formatIcsDate = (date: Date) => formatGoogleCalendarDate(date);

const formatSurveyDueDate = (dueDate: string) => {
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return dueDate;

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeEventTimeInput = (value: string) => {
  const raw = value.trim();
  if (!raw) return { time: null, note: '' };

  const exactMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  const looseMatches = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)];
  const looseMatch = looseMatches[0];
  const match = exactMatch || looseMatch;
  if (!match) return { time: null, note: raw };

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const laterMeridiem = looseMatches.find((timeMatch) => timeMatch[3])?.[3]?.toLowerCase();
  const meridiem = match[3]?.toLowerCase() ?? laterMeridiem;

  if (hour < 1 || hour > 23 || Number(minute) > 59) {
    return { time: null, note: raw };
  }

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return {
    time: `${String(hour).padStart(2, '0')}:${minute}`,
    note: exactMatch ? '' : raw,
  };
};

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

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getQuarterlyDuesActionTitle = (period: DuesPeriod) =>
  `Quarterly dues for Q${period.quarter} ${period.year}`;

const getDuesPeriodKey = (period: DuesPeriod) =>
  `${period.year}-q${period.quarter}`;

const isQuarterlyDuesActionItem = (
  item: ActionItem,
  period: DuesPeriod,
  dueDateKey: string
) => {
  const description = item.description.trim().toLowerCase();
  if (!description.startsWith('quarterly dues')) return false;

  const itemDueDate = typeof item.due_date === 'string' ? item.due_date.slice(0, 10) : null;
  if (itemDueDate === dueDateKey) return true;

  return description.includes(`q${period.quarter}`) && description.includes(String(period.year));
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
  return (
    <View className="bg-white rounded-xl shadow-sm overflow-hidden">
      {events.map((event, index) => (
        <Pressable
          key={event.id}
          onPress={() => {
            if (event.event_type !== 'birthday') onEditEvent(event);
          }}
          className={`p-4 active:bg-gray-50 ${index < events.length - 1 ? 'border-b border-cream' : ''}`}
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
          {/* Action buttons — Meet and Calendar inline on one row */}
          <View className="flex-row flex-wrap gap-2 mt-3">
            {event.meet_link && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Linking.openURL(event.meet_link!);
                }}
                className="bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10"
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
              className="bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10"
            >
              <Text className="text-xs mr-1.5">📅</Text>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                Add to Calendar
              </Text>
            </Pressable>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function getRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function HexShortcut({ emoji, label, sublabel, onPress }: {
  emoji: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  // Flat-top honeycomb hexagon: flat edges on top & bottom, points on left & right
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1 }} className="active:opacity-70">
      <View style={{ width: 80, height: 70, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={80} height={70} viewBox="0 0 80 70" style={{ position: 'absolute' }}>
          <Polygon
            points="20,1 60,1 79,35 60,69 20,69 1,35"
            fill="#fdf3dc"
            stroke="rgba(196,154,60,0.55)"
            strokeWidth={1.5}
          />
        </Svg>
        <Text style={{ fontSize: 28, lineHeight: 32 }}>{emoji}</Text>
      </View>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', marginTop: 4, textAlign: 'center' }}>{label}</Text>
      {sublabel ? (
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', marginTop: 2, textAlign: 'center' }}>{sublabel}</Text>
      ) : null}
    </Pressable>
  );
}

function HeaderActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexShrink: 0,
        paddingHorizontal: 12,
        paddingVertical: 7,
        marginBottom: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.72)',
        backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
      })}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function HiveScreen() {
  const { profile, communityId, communityRole, session } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const useMobileLayout = width < 768;
  const homeScrollRef = useRef<ScrollView>(null);
  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const canManageDues = isAdmin || communityRole === 'treasurer' || profile?.role === 'treasurer';
  const activeSurveyStorageKey = profile?.id && communityId
    ? `the-hive:home-active-survey:${communityId}:${profile.id}`
    : null;
  const activeWishStorageKey = profile?.id && communityId
    ? `the-hive:home-active-wish:${communityId}:${profile.id}`
    : null;
  const restoredSurveyStorageKeyRef = useRef<string | null>(null);
  const restoredWishStorageKeyRef = useRef<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  const [showAddHomeGuide, setShowAddHomeGuide] = useState(false);
  const [myAnswer, setMyAnswer] = useState('');
  const [mySubmittedAnswer, setMySubmittedAnswer] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);
  // Map of user_id → ISO timestamp for sorting by recency
  const [answerTimestamps, setAnswerTimestamps] = useState<Map<string, string>>(new Map());
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const voicePulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isVoiceListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(voicePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(voicePulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      voicePulse.stopAnimation();
      voicePulse.setValue(0);
    }
  }, [isVoiceListening, voicePulse]);
  const [activeAnswerPrompt, setActiveAnswerPrompt] = useState<ReturnType<typeof getTodayQuestion> | null>(null);
  // Map of user_id → answer text for today's question
  const [memberAnswers, setMemberAnswers] = useState<Map<string, string>>(new Map());
  const [recentAnswerMaps, setRecentAnswerMaps] = useState<Map<string, Map<string, string>>>(new Map());

  const { question: todayQuestion, index: todayIndex, dateKey: todayDateKey } = getTodayQuestion();
  const currentAnswerPrompt = activeAnswerPrompt ?? { question: todayQuestion, index: todayIndex, dateKey: todayDateKey };
  const recentDailyQuestions = getRecentDailyQuestions(7);

  const fetchTodayAnswers = useCallback(async () => {
    if (!communityId) return;
    const { data, error } = await supabase
      .from('daily_question_answers')
      .select('user_id, answer, created_at, updated_at')
      .eq('community_id', communityId)
      .eq('question_date', todayDateKey);
    if (error) {
      console.warn('Could not load daily question answers', error);
      return;
    }
    if (data) {
      const map = new Map<string, string>();
      const timestamps = new Map<string, string>();
      data.forEach((row: any) => {
        map.set(row.user_id, row.answer);
        const answeredAt = row.updated_at ?? row.created_at;
        if (answeredAt) timestamps.set(row.user_id, answeredAt);
      });
      setMemberAnswers(map);
      setAnswerTimestamps(timestamps);
      if (profile?.id && map.has(profile.id)) {
        setMySubmittedAnswer(map.get(profile.id)!);
        setMyAnswer(map.get(profile.id)!);
      } else if (profile?.id) {
        setMySubmittedAnswer('');
      }
    }
  }, [communityId, todayDateKey, profile?.id]);

  const fetchRecentAnswers = useCallback(async () => {
    if (!communityId) return;
    const dates = getRecentDailyQuestions(7).map(item => item.dateKey);
    const { data, error } = await supabase
      .from('daily_question_answers')
      .select('user_id, answer, question_date')
      .eq('community_id', communityId)
      .in('question_date', dates);
    if (error) {
      console.warn('Could not load recent daily question answers', error);
      return;
    }

    const next = new Map<string, Map<string, string>>();
    dates.forEach(date => next.set(date, new Map()));
    (data ?? []).forEach((row: any) => {
      const date = row.question_date as string;
      const answersForDate = next.get(date) ?? new Map<string, string>();
      answersForDate.set(row.user_id, row.answer);
      next.set(date, answersForDate);
    });
    setRecentAnswerMaps(next);
  }, [communityId]);

  useEffect(() => { fetchTodayAnswers(); }, [fetchTodayAnswers]);
  useEffect(() => { fetchRecentAnswers(); }, [fetchRecentAnswers]);

  const openAnswerModal = (prompt: ReturnType<typeof getTodayQuestion>, existingAnswer = '') => {
    setActiveAnswerPrompt(prompt);
    setMyAnswer(existingAnswer);
    setAnswerError(null);
    setShowAnswerModal(true);
  };

  const getMyAnswerForPrompt = (prompt: ReturnType<typeof getTodayQuestion>) => {
    if (!profile?.id) return '';
    if (prompt.dateKey === todayDateKey) return mySubmittedAnswer;
    return recentAnswerMaps.get(prompt.dateKey)?.get(profile.id) ?? '';
  };

  const handleSubmitAnswer = async () => {
    const text = myAnswer.trim();
    if (!text || !profile?.id || !communityId || isSubmittingAnswer) return;
    setAnswerError(null);
    setIsSubmittingAnswer(true);
    const { error } = await supabase.from('daily_question_answers').upsert({
      user_id: profile.id,
      community_id: communityId,
      question_index: currentAnswerPrompt.index,
      question_date: currentAnswerPrompt.dateKey,
      answer: text,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,question_date' });
    setIsSubmittingAnswer(false);

    if (error) {
      console.warn('Could not save daily question answer', error);
      setAnswerError('Could not save your answer. Please try again.');
      return;
    }

    if (currentAnswerPrompt.dateKey === todayDateKey) {
      setMySubmittedAnswer(text);
    }
    const submittedAt = new Date().toISOString();
    setMemberAnswers(prev => {
      const next = new Map(prev);
      if (currentAnswerPrompt.dateKey === todayDateKey) {
        next.set(profile.id, text);
      }
      return next;
    });
    setAnswerTimestamps(prev => {
      const next = new Map(prev);
      if (currentAnswerPrompt.dateKey === todayDateKey) {
        next.set(profile.id, submittedAt);
      }
      return next;
    });
    setRecentAnswerMaps(prev => {
      const next = new Map(prev);
      const answersForDate = new Map(next.get(currentAnswerPrompt.dateKey) ?? new Map());
      answersForDate.set(profile.id, text);
      next.set(currentAnswerPrompt.dateKey, answersForDate);
      return next;
    });
    setShowAnswerModal(false);
    fetchTodayAnswers();
    fetchRecentAnswers();
  };
  const [selectedWish, setSelectedWish] = useState<WishWithGranters | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [managingWish, setManagingWish] = useState<WishWithGranters | null>(null);
  const [wishToGrant, setWishToGrant] = useState<WishWithGranters | null>(null);
  const [showAddWishModal, setShowAddWishModal] = useState(false);

  const clearSelectedWishResume = useCallback(() => {
    if (activeWishStorageKey) removeStoredItem(activeWishStorageKey);
  }, [activeWishStorageKey]);

  const openWishDetail = useCallback((wish: WishWithGranters) => {
    setSelectedWish(wish);
    if (activeWishStorageKey) {
      setStoredItem(activeWishStorageKey, wish.id);
    }
  }, [activeWishStorageKey]);

  const closeWishDetail = useCallback(() => {
    setSelectedWish(null);
    clearSelectedWishResume();
  }, [clearSelectedWishResume]);

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
  const [homeActionItems, setHomeActionItems] = useState<ActionItem[]>([]);
  const [homeActionLoading, setHomeActionLoading] = useState(false);
  const [duesCoveredThisQuarter, setDuesCoveredThisQuarter] = useState(false);
  const [duesStatusLoading, setDuesStatusLoading] = useState(false);
  const [duesStatusChecked, setDuesStatusChecked] = useState(false);
  const [dismissedDuesPeriodKeys, setDismissedDuesPeriodKeys] = useState<Set<string>>(() => new Set());

  const fetchMyActionItems = useCallback(async () => {
    if (!profile?.id || !communityId) return;
    setHomeActionLoading(true);
    let { data, error } = await supabase
      .from('action_items')
      .select('*')
      .eq('assigned_to', profile.id)
      .eq('community_id', communityId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error && String(error.message ?? '').includes('archived_at')) {
      const fallback = await supabase
        .from('action_items')
        .select('*')
        .eq('assigned_to', profile.id)
        .eq('community_id', communityId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Could not load action items', error);
      setHomeActionItems([]);
      setDismissedDuesPeriodKeys(new Set());
    } else {
      const items = (data ?? []) as ActionItem[];
      setHomeActionItems(items.filter((item) => !item.archived_at));

      const currentPeriod = getCurrentDuesPeriod();
      const currentDueDateKey = formatDateKey(getDuesPeriodStartDate(currentPeriod));
      setDismissedDuesPeriodKeys(new Set(
        items
          .filter((item) => (
            isQuarterlyDuesActionItem(item, currentPeriod, currentDueDateKey)
            && (item.completed || !!item.archived_at)
          ))
          .map(() => getDuesPeriodKey(currentPeriod))
      ));
    }
    setHomeActionLoading(false);
  }, [profile?.id, communityId]);

  useEffect(() => { fetchMyActionItems(); }, [fetchMyActionItems]);

  const fetchMyDuesStatus = useCallback(async () => {
    if (!profile?.id || !communityId) {
      setDuesStatusLoading(false);
      setDuesStatusChecked(false);
      return;
    }
    const { year, quarter } = getCurrentDuesPeriod();
    setDuesStatusLoading(true);
    setDuesStatusChecked(false);

    const runDuesQuery = (columns: string) => (supabase as any)
      .from('honey_pot_transactions')
      .select(columns)
      .eq('community_id', communityId)
      .eq('transaction_type', 'deposit')
      .order('created_at', { ascending: false })
      .limit(300);

    let { data, error } = await runDuesQuery(
      'related_user_id, dues_year, dues_quarter, dues_covered_quarters, transaction_type, amount, note, external_counterparty_name, created_at'
    );

    if (error && String(error.message ?? '').includes('external_counterparty_name')) {
      const fallback = await runDuesQuery(
        'related_user_id, dues_year, dues_quarter, dues_covered_quarters, transaction_type, amount, note, created_at'
      );
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Could not load dues status', error);
      setDuesCoveredThisQuarter(false);
    } else {
      setDuesCoveredThisQuarter(duesTransactionsCoverMember(data ?? [], profile, { year, quarter }));
    }
    setDuesStatusChecked(true);
    setDuesStatusLoading(false);
  }, [profile, communityId]);

  useEffect(() => { fetchMyDuesStatus(); }, [fetchMyDuesStatus]);

  const [showConfetti, setShowConfetti] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedActionItemId, setSelectedActionItemId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const triggerCompletion = useCallback(() => {
    setShowConfetti(true);
  }, []);

  const getCurrentDuesReminderPeriodKey = useCallback((item: ActionItem) => {
    const currentPeriod = getCurrentDuesPeriod();
    const currentDueDateKey = formatDateKey(getDuesPeriodStartDate(currentPeriod));
    return isQuarterlyDuesActionItem(item, currentPeriod, currentDueDateKey)
      ? getDuesPeriodKey(currentPeriod)
      : null;
  }, []);

  const rememberDismissedDuesReminder = useCallback((items: ActionItem[]) => {
    const dismissedKeys = items
      .map(getCurrentDuesReminderPeriodKey)
      .filter(Boolean) as string[];
    if (dismissedKeys.length === 0) return;

    setDismissedDuesPeriodKeys((current) => {
      const next = new Set(current);
      dismissedKeys.forEach((key) => next.add(key));
      return next;
    });
  }, [getCurrentDuesReminderPeriodKey]);

  const forgetDismissedDuesReminder = useCallback((items: ActionItem[]) => {
    const dismissedKeys = items
      .map(getCurrentDuesReminderPeriodKey)
      .filter(Boolean) as string[];
    if (dismissedKeys.length === 0) return;

    setDismissedDuesPeriodKeys((current) => {
      const next = new Set(current);
      dismissedKeys.forEach((key) => next.delete(key));
      return next;
    });
  }, [getCurrentDuesReminderPeriodKey]);

  const toggleActionItem = useCallback(async (item: ActionItem) => {
    const completed = !item.completed;
    const completedAt = completed ? new Date().toISOString() : null;
    setHomeActionItems(prev => prev.map(action => (
      action.id === item.id
        ? { ...action, completed, completed_at: completedAt }
        : action
    )));
    if (completed) triggerCompletion();

    const { error } = await supabase
      .from('action_items')
      .update({ completed, completed_at: completedAt } as any)
      .eq('id', item.id);

    if (error) {
      console.warn('Could not update action item', error);
      setHomeActionItems(prev => prev.map(action => (
        action.id === item.id ? item : action
      )));
      Alert.alert('Could not update task', 'Please try again.');
    }
  }, [triggerCompletion]);

  const archiveActionItem = useCallback((item: ActionItem) => {
    const archive = async () => {
      setHomeActionItems(prev => prev.filter(action => action.id !== item.id));
      rememberDismissedDuesReminder([item]);
      const { error } = await supabase
        .from('action_items')
        .update({ archived_at: new Date().toISOString() } as any)
        .eq('id', item.id);

      if (error) {
        console.warn('Could not archive action item', error);
        setHomeActionItems(prev => [item, ...prev]);
        forgetDismissedDuesReminder([item]);
        Alert.alert('Could not archive task', 'Please try again.');
      }
    };

    const message = `Archive this task from your list?\n\n"${item.description}"`;
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) archive();
      return;
    }

    Alert.alert('Archive Task', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: archive },
    ]);
  }, [forgetDismissedDuesReminder, rememberDismissedDuesReminder]);

  const archiveCompletedActionItems = useCallback(() => {
    const completedItems = homeActionItems.filter(item => item.completed);
    if (completedItems.length === 0) return;
    const completedIds = completedItems.map(item => item.id);

    const archive = async () => {
      const previousItems = homeActionItems;
      setHomeActionItems(prev => prev.filter(action => !completedIds.includes(action.id)));
      rememberDismissedDuesReminder(completedItems);
      const { error } = await supabase
        .from('action_items')
        .update({ archived_at: new Date().toISOString() } as any)
        .in('id', completedIds);

      if (error) {
        console.warn('Could not archive completed action items', error);
        setHomeActionItems(previousItems);
        forgetDismissedDuesReminder(completedItems);
        Alert.alert('Could not archive tasks', 'Please try again.');
      }
    };

    const taskLabel = completedItems.length === 1 ? 'task' : 'tasks';
    const message = `Archive ${completedItems.length} completed ${taskLabel} from your list?`;
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) archive();
      return;
    }

    Alert.alert('Archive Completed Tasks', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: archive },
    ]);
  }, [forgetDismissedDuesReminder, homeActionItems, rememberDismissedDuesReminder]);

  const handleAddTask = async () => {
    if (!newTaskText.trim() || !profile?.id || !communityId) return;
    setSavingTask(true);
    setTaskError(null);
    const { error } = await supabase.from('action_items').insert({
      meeting_id: null,
      description: newTaskText.trim(),
      assigned_to: profile.id,
      community_id: communityId,
      completed: false,
    } as any);
    setSavingTask(false);

    if (error) {
      console.warn('Could not add task', error);
      setTaskError('Could not add that task. Please try again.');
      return;
    }

    setNewTaskText('');
    setShowAddTaskModal(false);
    fetchMyActionItems();
  };

  const selectedActionItem = selectedActionItemId
    ? homeActionItems.find(item => item.id === selectedActionItemId) ?? null
    : null;

  const resetHomeToRoot = useCallback(() => {
    if (activeSurveyStorageKey) removeStoredItem(activeSurveyStorageKey);
    clearSelectedWishResume();
    setSelectedWish(null);
    setActiveSurvey(null);
    setEditingWish(null);
    setManagingWish(null);
    setWishToGrant(null);
    setShowAddWishModal(false);
    setShowEventModal(false);
    setEditingEvent(null);
    setEventError(null);
    setShowAddTaskModal(false);
    setSelectedActionItemId(null);
    setTaskError(null);
    setShowCatchUpModal(false);
    setShowAnswerModal(false);
    setShowAddHomeGuide(false);
    setActiveAnswerPrompt(null);
    homeScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeSurveyStorageKey, clearSelectedWishResume]);

  useEffect(() => addHomeResetListener(resetHomeToRoot), [resetHomeToRoot]);

  const markQuarterlyDuesReminderDone = useCallback(async () => {
    if (!profile?.id || !communityId) return;

    const now = new Date();
    const completedAt = now.toISOString();
    const period = getCurrentDuesPeriod(now);
    const dueDate = getDuesPeriodStartDate(period);
    const dueDateKey = formatDateKey(dueDate);
    const description = getQuarterlyDuesActionTitle(period);
    const existingItem = homeActionItems.find(item => (
      isQuarterlyDuesActionItem(item, period, dueDateKey)
    ));

    if (existingItem?.completed) return;

    triggerCompletion();

    if (existingItem) {
      setHomeActionItems(prev => prev.map(action => (
        action.id === existingItem.id
          ? { ...action, completed: true, completed_at: completedAt }
          : action
      )));

      const { error } = await supabase
        .from('action_items')
        .update({ completed: true, completed_at: completedAt } as any)
        .eq('id', existingItem.id)
        .eq('assigned_to', profile.id)
        .eq('community_id', communityId);

      if (error) {
        console.warn('Could not mark dues reminder done', error);
        setHomeActionItems(prev => prev.map(action => (
          action.id === existingItem.id ? existingItem : action
        )));
        Alert.alert('Could not update dues reminder', 'Please try again.');
      }
      return;
    }

    const optimisticAction: ActionItem = {
      id: `quarterly-dues-${period.year}-q${period.quarter}-${completedAt}`,
      meeting_id: null,
      community_id: communityId,
      description,
      assigned_to: profile.id,
      due_date: dueDateKey,
      completed: true,
      completed_at: completedAt,
      archived_at: null,
      created_at: completedAt,
    };

    setHomeActionItems(prev => [optimisticAction, ...prev]);

    const { data, error } = await supabase
      .from('action_items')
      .insert({
        meeting_id: null,
        description,
        assigned_to: profile.id,
        community_id: communityId,
        due_date: dueDateKey,
        completed: true,
        completed_at: completedAt,
      } as any)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not save dues reminder completion', error);
      setHomeActionItems(prev => prev.filter(action => action.id !== optimisticAction.id));
      Alert.alert('Could not update dues reminder', 'Please try again.');
      return;
    }

    if (data) {
      setHomeActionItems(prev => prev.map(action => (
        action.id === optimisticAction.id ? data as ActionItem : action
      )));
    }
  }, [communityId, homeActionItems, profile?.id, triggerCompletion]);

  // Activity feed
  const { items: activityItems, loading: activityLoading, refetch: refetchActivity } = useActivityFeed(
    communityId ?? undefined,
    currentUserId ?? undefined
  );
  const [currentMembershipStartedAt, setCurrentMembershipStartedAt] = useState<string | null>(null);

  // Read state — timestamp-based (for auto-clear) + per-item set (for tap-to-clear)
  const activityReadKey = communityId && currentUserId ? `the-hive:activity-viewed:${communityId}:${currentUserId}` : null;
  const activityReadIdsKey = communityId && currentUserId ? `the-hive:activity-read-ids:${communityId}:${currentUserId}` : null;
  const activityDefaultReadAt = currentMembershipStartedAt ?? (profile?.created_at as string | undefined) ?? new Date(0).toISOString();

  const [sessionReadAt, setSessionReadAt] = useState<string>(() => {
    if (activityReadKey) {
      return getStoredItem(activityReadKey) ?? activityDefaultReadAt;
    }
    return activityDefaultReadAt;
  });

  const [readItemIds, setReadItemIds] = useState<Set<string>>(new Set());
  const [showActivityConfetti, setShowActivityConfetti] = useState(false);
  const [isActivityChecking, setIsActivityChecking] = useState(false);
  const [showActivityPullSpace, setShowActivityPullSpace] = useState(false);
  const activityLastFocusRefreshRef = useRef(0);
  const activityRefreshSpin = useRef(new Animated.Value(0)).current;
  const activityRefreshRotation = activityRefreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const triggerActivityConfetti = useCallback(() => {
    setShowActivityConfetti(true);
  }, []);

  // Load member-specific activity read state when the signed-in account changes.
  useEffect(() => {
    if (!activityReadKey || !activityReadIdsKey) {
      setSessionReadAt(activityDefaultReadAt);
      setReadItemIds(new Set());
      return;
    }

    setSessionReadAt(getStoredItem(activityReadKey) ?? activityDefaultReadAt);
    try {
      const stored = getStoredItem(activityReadIdsKey);
      setReadItemIds(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch {
      setReadItemIds(new Set());
    }
  }, [activityDefaultReadAt, activityReadIdsKey, activityReadKey]);

  const markItemRead = useCallback((itemId: string) => {
    setReadItemIds(prev => {
      const next = new Set(prev);
      next.add(itemId);
      if (activityReadIdsKey) {
        setStoredItem(activityReadIdsKey, JSON.stringify([...next]));
      }
      return next;
    });
  }, [activityReadIdsKey]);

  const unreadActivityCount = activityItems.reduce(
    (count, item) => count + (item.timestamp > sessionReadAt && !readItemIds.has(item.id) ? 1 : 0),
    0
  );
  const hasUnreadActivity = unreadActivityCount > 0;

  const markAllActivityRead = useCallback(() => {
    const now = new Date().toISOString();
    setSessionReadAt(now);
    setReadItemIds(new Set());
    if (hasUnreadActivity) {
      triggerActivityConfetti();
    }
    if (activityReadKey) setStoredItem(activityReadKey, now);
    if (activityReadIdsKey) removeStoredItem(activityReadIdsKey);
  }, [activityReadKey, activityReadIdsKey, hasUnreadActivity, triggerActivityConfetti]);

  const getActivityDestination = useCallback((item: ActivityItem): ActivityItem['navigatesTo'] => {
    if (item.navigatesTo) return item.navigatesTo;
    if (item.type === 'wish_posted' || item.type === 'wish_granted') return 'wish';
    return undefined;
  }, []);

  const openWishById = useCallback(async (
    wishId: string,
    options: { alertOnUnavailable?: boolean; clearResumeOnUnavailable?: boolean } = {}
  ) => {
    if (!communityId) return;

    try {
      let { data, error } = await (supabase as any)
        .from('wishes')
        .select('*, user:profiles!user_id(*), board_category:board_categories!wishes_board_category_id_fkey(id, name, topic_kind, status), granters:wish_granters(*, granter:profiles!granter_id(*))')
        .eq('id', wishId)
        .eq('community_id', communityId)
        .single();

      if (
        error &&
        (String(error.message ?? '').includes('wishes_board_category_id_fkey') ||
          String(error.message ?? '').includes('board_category'))
      ) {
        const fallback = await (supabase as any)
          .from('wishes')
          .select('*, user:profiles!user_id(*), granters:wish_granters(*, granter:profiles!granter_id(*))')
          .eq('id', wishId)
          .eq('community_id', communityId)
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error || !data) throw error ?? new Error('Wish not found');
      openWishDetail(data as WishWithGranters);
    } catch (error) {
      console.warn('Could not open wish', error);
      if (options.clearResumeOnUnavailable) {
        clearSelectedWishResume();
      }
      if (options.alertOnUnavailable) {
        Alert.alert('Wish unavailable', 'That wish may have been archived or moved.');
      }
    }
  }, [clearSelectedWishResume, communityId, openWishDetail]);

  const openWishFromActivity = useCallback((wishId: string) => {
    void openWishById(wishId, { alertOnUnavailable: true });
  }, [openWishById]);

  useEffect(() => {
    if (!activeWishStorageKey) {
      restoredWishStorageKeyRef.current = null;
      return;
    }
    if (selectedWish || restoredWishStorageKeyRef.current === activeWishStorageKey) return;

    const storedWishId = getStoredItem(activeWishStorageKey);
    restoredWishStorageKeyRef.current = activeWishStorageKey;
    if (!storedWishId) return;

    void openWishById(storedWishId, { clearResumeOnUnavailable: true });
  }, [activeWishStorageKey, openWishById, selectedWish]);

  const navigateFromActivityItem = useCallback((item: ActivityItem) => {
    const destination = getActivityDestination(item);

    if (destination === 'board') {
      // Pre-set the board's localStorage keys so it opens directly to the right post
      if (communityId) {
        if (item.categoryId) {
          setStoredItem(`the-hive:last-board-category:${communityId}`, item.categoryId);
        }
        setStoredItem(`the-hive:last-board-post:${communityId}`, item.sourceId);
        setStoredItem(`the-hive:board-direct-open:${communityId}`, 'true');
      }
      router.push({
        pathname: '/board',
        params: {
          ...(item.categoryId ? { categoryId: item.categoryId } : {}),
          postId: item.sourceId,
          open: String(Date.now()),
        },
      });
    } else if (destination === 'members') {
      router.push('/members');
    } else if (destination === 'wish') {
      openWishFromActivity(item.sourceId);
    } else if (destination === 'messages') {
      if (item.sourceId) {
        router.push({ pathname: '/messages', params: { roomId: item.sourceId } });
      } else {
        router.push('/messages');
      }
    }
  }, [communityId, getActivityDestination, openWishFromActivity, router]);

  const handleActivityPress = useCallback((item: ActivityItem) => {
    const wasUnread = item.timestamp > sessionReadAt && !readItemIds.has(item.id);
    const clearsLastUnread = wasUnread && unreadActivityCount === 1;
    const destination = getActivityDestination(item);

    if (wasUnread) {
      markItemRead(item.id);
    }

    if (clearsLastUnread) {
      triggerActivityConfetti();
      if (destination) {
        setTimeout(() => navigateFromActivityItem(item), 700);
        return;
      }
    }

    navigateFromActivityItem(item);
  }, [getActivityDestination, markItemRead, navigateFromActivityItem, readItemIds, sessionReadAt, triggerActivityConfetti, unreadActivityCount]);

  const handleActivityScroll = useCallback((event: any) => {
    const y = event.nativeEvent?.contentOffset?.y ?? 0;
    if (y < -8 && !showActivityPullSpace) {
      setShowActivityPullSpace(true);
    } else if (y >= 0 && showActivityPullSpace && !isActivityChecking) {
      setShowActivityPullSpace(false);
    }
  }, [isActivityChecking, showActivityPullSpace]);

  const handleActivityRefresh = useCallback(async () => {
    const previousTop = activityItems[0];
    const previousIds = new Set(activityItems.map(item => item.id));
    setIsActivityChecking(true);
    setShowActivityPullSpace(true);
    activityRefreshSpin.setValue(0);
    const spin = Animated.loop(
      Animated.timing(activityRefreshSpin, { toValue: 1, duration: 700, useNativeDriver: true })
    );
    spin.start();

    try {
      const refreshed = await refetchActivity();
      const nextItems = refreshed ?? [];
      const nextTop = nextItems[0];
      const hasNewActivity = !!nextTop && (
        !previousTop ||
        nextTop.timestamp > previousTop.timestamp ||
        (nextTop.timestamp === previousTop.timestamp && !previousIds.has(nextTop.id))
      );
      const hasUnreadAfterRefresh = nextItems.some(
        item => item.timestamp > sessionReadAt && !readItemIds.has(item.id)
      );

      if (!hasNewActivity && !hasUnreadAfterRefresh && (nextItems.length > 0 || activityItems.length > 0)) {
        triggerActivityConfetti();
      }
    } finally {
      spin.stop();
      activityRefreshSpin.stopAnimation();
      setIsActivityChecking(false);
      setTimeout(() => setShowActivityPullSpace(false), 420);
    }
  }, [activityItems, activityRefreshSpin, readItemIds, refetchActivity, sessionReadAt, triggerActivityConfetti]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - activityLastFocusRefreshRef.current < 3000) return;

      activityLastFocusRefreshRef.current = now;
      refetchActivity();
    }, [refetchActivity])
  );

  // Member carousel state
  const [carouselMembers, setCarouselMembers] = useState<{ id: string; name: string; avatar_url?: string | null; role: string }[]>([]);

  useEffect(() => {
    if (!communityId) {
      setCarouselMembers([]);
      setCurrentMembershipStartedAt(null);
      return;
    }
    supabase
      .from('community_memberships')
      .select('user_id, role, created_at, profiles(id, name, avatar_url)')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const currentMembership = data.find((m: any) => m.user_id === currentUserId);
          setCurrentMembershipStartedAt(currentMembership?.created_at ?? null);
          setCarouselMembers(
            data.map((m: any) => ({
              id: m.profiles?.id ?? m.user_id,
              name: m.profiles?.name ?? '',
              avatar_url: m.profiles?.avatar_url ?? null,
              role: m.role ?? 'member',
            })).filter(m => m.name)
          );
        } else {
          setCurrentMembershipStartedAt(null);
        }
      });
  }, [communityId, currentUserId]);

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

  // Surveys
  const {
    availableSurveys,
    pendingSurveys,
    myResponses,
    submitResponse,
    loading: surveysLoading,
  } = useSurveys(communityId ?? undefined, profile?.id);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [wishStatusTab, setWishStatusTab] = useState<WishStatusTabKey>('public');
  const [todoStatusTab, setTodoStatusTab] = useState<TodoStatusTabKey>('open');
  const pendingSurveyIds = new Set(pendingSurveys.map((survey) => survey.id));
  const activeSurveyResponse = activeSurvey ? myResponses.get(activeSurvey.id) : undefined;
  const activeSurveyIsEditing = !!activeSurvey && !!activeSurveyResponse && !pendingSurveyIds.has(activeSurvey.id);
  const {
    items: carryForwardItems,
    loading: carryForwardLoading,
    error: carryForwardError,
  } = useCarryForwardContext({
    communityId,
    userId: profile?.id,
    survey: activeSurvey,
  });
  const visibleHdWishes = wishStatusTab === 'granted' ? grantedWishes : publicWishes;
  const hdWishesEmptyText = wishStatusTab === 'granted'
    ? 'No granted HD wishes yet'
    : 'No public HD wishes yet';

  const openSurvey = useCallback((survey: Survey) => {
    setActiveSurvey(survey);
    if (activeSurveyStorageKey) {
      setStoredItem(activeSurveyStorageKey, survey.id);
    }
  }, [activeSurveyStorageKey]);

  const closeSurvey = useCallback(() => {
    setActiveSurvey(null);
    if (activeSurveyStorageKey) {
      removeStoredItem(activeSurveyStorageKey);
    }
  }, [activeSurveyStorageKey]);

  const handleSurveySubmit = useCallback(async (answers: SurveyAnswers) => {
    if (!activeSurvey) return { error: 'No active survey' };

    const result = await submitResponse(activeSurvey.id, answers);
    if (!result.error && activeSurveyStorageKey) {
      removeStoredItem(activeSurveyStorageKey);
    }
    return result;
  }, [activeSurvey, activeSurveyStorageKey, submitResponse]);

  useEffect(() => {
    if (!activeSurveyStorageKey) {
      restoredSurveyStorageKeyRef.current = null;
      return;
    }
    if (surveysLoading || restoredSurveyStorageKeyRef.current === activeSurveyStorageKey) return;

    const storedSurveyId = getStoredItem(activeSurveyStorageKey);
    restoredSurveyStorageKeyRef.current = activeSurveyStorageKey;
    if (!storedSurveyId) return;

    const survey = pendingSurveys.find((item) => item.id === storedSurveyId);
    if (survey) {
      setActiveSurvey(survey);
    } else {
      removeStoredItem(activeSurveyStorageKey);
    }
  }, [activeSurveyStorageKey, pendingSurveys, surveysLoading]);

  useEffect(() => {
    if (!activeSurvey || surveysLoading) return;

    const currentSurvey = pendingSurveys.find((item) => item.id === activeSurvey.id);
    if (currentSurvey && currentSurvey !== activeSurvey) {
      setActiveSurvey(currentSurvey);
    }
  }, [activeSurvey, pendingSurveys, surveysLoading]);

  // For granting wishes
  const { grantWish } = useWishes();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), handleActivityRefresh(), fetchTodayAnswers(), fetchRecentAnswers(), fetchMyActionItems(), fetchMyDuesStatus()]);
    } finally {
      setRefreshing(false);
    }
  };

  const showPhoneInstallHelp = useCallback(() => {
    setShowAddHomeGuide(true);
  }, []);

  const homeIsUpdating = refreshing || isLoading || activityLoading || homeActionLoading || duesStatusLoading;

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

    const normalizedTime = normalizeEventTimeInput(eventTime);
    if (eventTime.trim() && !normalizedTime.time) {
      setEventError('For time, use something like 7:30 PM. Put extra details like doors/showtime in the description.');
      return;
    }
    const descriptionWithTimeNote = [
      normalizedTime.note ? `Time note: ${normalizedTime.note}` : null,
      eventDescription.trim() || null,
    ].filter(Boolean).join('\n\n');

    setSavingEvent(true);
    try {
      if (editingEvent) {
        // Update existing event
        const { error } = await supabase
          .from('events')
          .update({
            title: eventTitle,
            event_date: eventDateIso,
            event_time: normalizedTime.time,
            description: descriptionWithTimeNote || null,
            location: eventLocation || null,
          })
          .eq('id', editingEvent.id);

        if (error) throw error;
      } else {
        // Create new event
        const newEvent: Record<string, string | null> = {
          title: eventTitle,
          event_date: eventDateIso,
          community_id: communityId,
        };

        if (descriptionWithTimeNote) newEvent.description = descriptionWithTimeNote;
        if (normalizedTime.time) newEvent.event_time = normalizedTime.time;
        if (eventLocation.trim()) newEvent.location = eventLocation.trim();

        const { error } = await supabase.functions.invoke('create-event', {
          body: newEvent,
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
        setEventError(error?.message || `Failed to ${editingEvent ? 'update' : 'create'} event. Please try again.`);
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
    closeWishDetail();
  };

  const canEditWish = useCallback((wish: Wish) => wish.user_id === profile?.id, [profile?.id]);
  const canDeleteWish = useCallback((wish: Wish) => !!profile && (isAdmin || wish.user_id === profile.id), [isAdmin, profile]);
  const canGrantWish = useCallback((wish: Wish) => wish.user_id === profile?.id && wish.status === 'public', [profile?.id]);
  const canLinkWishBoard = useCallback((wish: Wish) => (
    !!profile
    && (wish.status !== 'fulfilled' || !!wish.board_category_id || !!wish.source_board_post_id)
    && (isAdmin || wish.user_id === profile.id)
  ), [isAdmin, profile]);
  const canArchiveWish = useCallback((wish: Wish) => (
    !!profile
    && wish.status === 'public'
    && wish.is_active !== false
    && (isAdmin || wish.user_id === profile.id)
  ), [isAdmin, profile]);
  const canOpenWishActions = useCallback((wish: Wish) => (
    canGrantWish(wish) || canLinkWishBoard(wish) || canEditWish(wish) || canArchiveWish(wish) || canDeleteWish(wish)
  ), [canArchiveWish, canDeleteWish, canEditWish, canGrantWish, canLinkWishBoard]);

  const handleArchiveWish = useCallback((wish: Wish) => {
    if (!profile || !communityId || !canArchiveWish(wish)) return;

    const archiveWish = async () => {
      let query = supabase
        .from('wishes')
        .update({ status: 'private', is_active: false } as any)
        .eq('id', wish.id)
        .eq('community_id', communityId);

      if (!isAdmin) {
        query = query.eq('user_id', profile.id);
      }

      const { error } = await query;

      if (error) {
        Alert.alert('Error', 'Failed to archive wish. Please try again.');
        return;
      }

      await refetch();
      if (selectedWish?.id === wish.id) {
        closeWishDetail();
      }
      if (managingWish?.id === wish.id) {
        setManagingWish(null);
      }
    };

    const message = `Archive this wish from HD Wishes?\n\n"${wish.description}"`;

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        archiveWish();
      }
      return;
    }

    Alert.alert('Archive Wish', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', onPress: archiveWish },
    ]);
  }, [canArchiveWish, closeWishDetail, communityId, isAdmin, managingWish?.id, profile, refetch, selectedWish?.id]);

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId) return;
    if (!canDeleteWish(wish)) return;

    const deleteWish = async () => {
      let query = supabase
        .from('wishes')
        .delete()
        .eq('id', wish.id)
        .eq('community_id', communityId);

      if (!isAdmin) {
        query = query.eq('user_id', profile.id);
      }

      const { error } = await query;

      if (error) {
        Alert.alert('Error', 'Failed to delete wish. Please try again.');
        return;
      }

      await refetch();
      if (selectedWish?.id === wish.id) {
        closeWishDetail();
      }
      if (managingWish?.id === wish.id) {
        setManagingWish(null);
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

  const openBoardFromWish = useCallback((categoryId: string) => {
    if (!communityId) return;
    setStoredItem(`the-hive:last-board-category:${communityId}`, categoryId);
    removeStoredItem(`the-hive:last-board-post:${communityId}`);
    setStoredItem(`the-hive:board-direct-open:${communityId}`, 'true');
    closeWishDetail();
    router.push({
      pathname: '/board',
      params: {
        categoryId,
        open: String(Date.now()),
      },
    });
  }, [closeWishDetail, communityId, router]);

  const createBoardFromWish = useCallback(async (wish: WishWithGranters) => {
    if (!profile || !communityId) return;

    try {
      if (wish.board_category_id) {
        openBoardFromWish(wish.board_category_id);
        return;
      }

      const category = await linkWishToHdBoard({
        wish,
        communityId,
        actorId: profile.id,
      });

      await refetch();
      openBoardFromWish(category.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to create board: ${message}`);
    }
  }, [communityId, openBoardFromWish, profile, refetch]);

  const handleUnlinkWishFromBoard = useCallback((wish: WishWithGranters) => {
    if (!profile || !communityId) return;

    const unlink = async () => {
      try {
        await unlinkWishFromBoard({ wishId: wish.id, communityId });
        await refetch();
        setManagingWish(null);
        if (selectedWish?.id === wish.id) {
          closeWishDetail();
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to unlink wish: ${message}`);
      }
    };

    const message = `Unlink this wish from its HD board?\n\n"${wish.description}"`;
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) unlink();
      return;
    }

    Alert.alert('Unlink Wish', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', onPress: unlink },
    ]);
  }, [closeWishDetail, communityId, profile, refetch, selectedWish?.id]);

  const homeTodos: HomeTodo[] = [
    ...availableSurveys.map(s => {
      const response = myResponses.get(s.id);
      const submittedAt = response?.submitted_at ?? null;
      const isDone = !!submittedAt && !pendingSurveyIds.has(s.id);

      return {
        id: `survey-${s.id}`,
        emoji: '📋',
        title: s.title,
        detail: isDone
          ? `Submitted ${formatDateShort(submittedAt)} · Tap to edit`
          : s.due_date
            ? `Due ${formatSurveyDueDate(s.due_date)}`
            : 'Awaiting your response',
        cta: isDone ? undefined : 'Fill out →',
        isDone,
        completedAt: isDone ? submittedAt : null,
        onPress: () => openSurvey(s),
      };
    }),
    ...homeActionItems.map(a => ({
      id: `action-${a.id}`,
      emoji: '📝',
      title: a.description,
      detail: a.completed
        ? `Done${a.completed_at ? ` · ${formatDateShort(a.completed_at)}` : ''}`
        : a.due_date ? `Due ${formatDateShort(a.due_date)}` : undefined,
      isDone: a.completed,
      completedAt: a.completed_at,
      onPress: () => setSelectedActionItemId(a.id),
      onToggle: () => toggleActionItem(a),
      onLongPress: () => archiveActionItem(a),
      onArchive: a.completed ? () => archiveActionItem(a) : undefined,
    })),
    ...(() => {
      const today = new Date();
      const { year, quarter } = getCurrentDuesPeriod(today);
      const period = { year, quarter };
      const dueDate = getDuesPeriodStartDate(period);
      const dueDateKey = formatDateKey(dueDate);
      const duesReminderDismissed = dismissedDuesPeriodKeys.has(getDuesPeriodKey(period));
      const duesReminderAction = homeActionItems.find(item => (
        isQuarterlyDuesActionItem(item, period, dueDateKey)
      ));

      if (!duesStatusChecked || duesCoveredThisQuarter || duesReminderAction || duesReminderDismissed) return [];

      const dueDateLabel = formatDateShort(dueDate);
      const isDueToday = isDuesPeriodStartDay(today, period);
      return [{
        id: `quarterly-dues-${year}-q${quarter}`,
        emoji: '🍯',
        title: isDueToday ? 'Quarterly dues are due today!' : 'Quarterly dues are still due',
        detail: duesStatusLoading
          ? 'Checking payment status...'
          : `Due ${dueDateLabel} · $${QUARTERLY_DUES_AMOUNT} for Q${quarter} ${year}`,
        cta: canManageDues ? 'Record →' : undefined,
        ctaOnPress: canManageDues ? () => router.push('/admin') : undefined,
        onPress: markQuarterlyDuesReminderDone,
        onToggle: markQuarterlyDuesReminderDone,
      }];
    })(),
  ];
  const openTodos = homeTodos.filter(todo => !todo.isDone);
  const doneTodos = homeTodos
    .filter(todo => todo.isDone)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const visibleTodos = todoStatusTab === 'done' ? doneTodos : openTodos;
  const completedActionCount = homeActionItems.filter(action => action.completed).length;
  const dashboardSectionStyle = useMobileLayout
    ? { width: '100%' as const }
    : { flex: 1, minWidth: 0 };
  const dashboardPanelHeight = useMobileLayout ? 300 : 280;
  const todoPanelHeight = useMobileLayout ? 420 : 280;
  const wishPanelHeight = useMobileLayout ? 460 : 360;

  const renderTodoRow = (todo: HomeTodo, isLast: boolean) => {
    const isDone = !!todo.isDone;
    const circleStyle = (pressed = false) => ({
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: isDone ? 'rgba(142,122,94,0.36)' : '#bd9348',
      backgroundColor: isDone ? 'rgba(142,122,94,0.12)' : pressed ? '#f7e7bd' : 'rgba(189,147,72,0.16)',
      flexShrink: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    });

    return (
      <Pressable
        key={todo.id}
        onPress={todo.onPress}
        onLongPress={todo.onLongPress}
        delayLongPress={520}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          padding: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: 'rgba(222,193,129,0.28)',
          backgroundColor: pressed && todo.onPress
            ? '#fbf4e3'
            : isDone ? '#fffdf5' : '#fff8e8',
          gap: 10,
        })}
      >
        {todo.onToggle ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              todo.onToggle?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={isDone ? 'Mark task open' : 'Mark task complete'}
            hitSlop={8}
            style={({ pressed }) => circleStyle(pressed)}
          >
            {isDone && <Text style={{ color: '#8e7a5e', fontSize: 12, lineHeight: 14 }}>✓</Text>}
          </Pressable>
        ) : (
          <View style={circleStyle(false)} />
        )}
        <Text style={{ fontSize: 18, flexShrink: 0 }}>{todo.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontFamily: isDone ? 'Lato_400Regular' : 'Lato_700Bold',
            fontSize: 13,
            color: isDone ? '#7f715f' : '#2d2d2d',
            lineHeight: 18,
            fontStyle: isDone ? 'italic' : 'normal',
            textDecorationLine: isDone ? 'line-through' : 'none',
          }} numberOfLines={2}>
            {todo.title}
          </Text>
          {todo.detail ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: isDone ? '#8e7a5e' : '#9a8060', marginTop: 2 }}>
              {todo.detail}
            </Text>
          ) : null}
        </View>
        {isDone && todo.onArchive ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              todo.onArchive?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Archive completed task"
            hitSlop={8}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#ead9b8' : '#fff8e8',
              borderColor: 'rgba(189,147,72,0.36)',
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 5,
              flexShrink: 0,
            })}
          >
            <Ionicons name="archive-outline" size={16} color="#8e6f35" />
          </Pressable>
        ) : !isDone && todo.cta ? (
          todo.ctaOnPress ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                todo.ctaOnPress?.();
              }}
              accessibilityRole="button"
              accessibilityLabel={todo.cta.replace('→', '').trim()}
              hitSlop={8}
              style={({ pressed }) => ({
                opacity: pressed ? 0.72 : 1,
                flexShrink: 0,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>{todo.cta}</Text>
            </Pressable>
          ) : (
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', flexShrink: 0 }}>{todo.cta}</Text>
          )
        ) : null}
      </Pressable>
    );
  };

  const renderTodoList = () => (
    <>
      {todoStatusTab === 'done' && completedActionCount > 0 ? (
        <Pressable
          onPress={archiveCompletedActionItems}
          accessibilityRole="button"
          accessibilityLabel="Archive all completed tasks"
          style={({ pressed }) => ({
            alignSelf: 'flex-end',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 10,
            marginRight: 12,
            marginBottom: 2,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(189,147,72,0.34)',
            backgroundColor: pressed ? '#fbf0d7' : '#fff8e8',
            paddingHorizontal: 10,
            paddingVertical: 6,
          })}
        >
          <Ionicons name="archive-outline" size={14} color="#bd9348" />
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>Archive all</Text>
        </Pressable>
      ) : null}
      {visibleTodos.map((todo, index) => renderTodoRow(todo, index === visibleTodos.length - 1))}
    </>
  );

  const manageWishActionStyle = (tone: 'gold' | 'neutral' | 'danger' = 'neutral') => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tone === 'danger'
      ? 'rgba(239,68,68,0.18)'
      : tone === 'gold'
        ? 'rgba(189,147,72,0.28)'
        : 'rgba(49,49,48,0.10)',
    backgroundColor: tone === 'danger'
      ? '#fff1f2'
      : tone === 'gold'
        ? '#fff8e8'
        : '#fffdf5',
    marginTop: 8,
  });
  const manageWishToneColor = (tone: 'gold' | 'neutral' | 'danger' = 'neutral') => (
    tone === 'danger' ? '#ef4444' : tone === 'gold' ? '#bd9348' : 'rgba(49,49,48,0.66)'
  );

  // Show wish detail fullscreen
  if (selectedWish) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <WishDetail
          wish={selectedWish}
          onClose={closeWishDetail}
          onGrant={handleGrantWish}
          canManage={canOpenWishActions(selectedWish)}
          onManage={() => {
            const wish = selectedWish;
            closeWishDetail();
            setManagingWish(wish);
          }}
          onOpenBoard={openBoardFromWish}
          onCreateBoard={createBoardFromWish}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <AppHeader title="HIVE" />

      <ScrollView
        ref={homeScrollRef}
        className="flex-1"
        contentContainerClassName="pb-4"
        contentContainerStyle={{ paddingBottom: useMobileLayout ? 104 : 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Combined Daily Question + Member Answer Bubbles */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(189,147,72,0.45)', backgroundColor: '#fffbf0' }}>
          <View style={{ flexDirection: 'row' }}>

            {/* Left: fixed question panel */}
            <View
              onTouchStart={() => setExpandedAnswerId(null)}
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
                style={{ fontFamily: 'Lato_400Regular', fontSize: 9, color: '#bd9348', letterSpacing: 0.5, marginBottom: 3 }}
              >
                {todayQuestion.emoji} {todayQuestion.category.toUpperCase()}
              </Text>
              <Text
                style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: useMobileLayout ? 12 : 13, color: '#2d2d2d', lineHeight: 18 }}
                numberOfLines={6}
              >
                {todayQuestion.text}
              </Text>
              <Pressable
                onPress={() => setShowCatchUpModal(true)}
                style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(189,147,72,0.35)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348' }}>
                  Catch up
                </Text>
              </Pressable>
            </View>

            {/* Right: scrolling member answer bubbles */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              onTouchStart={() => setExpandedAnswerId(null)}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}
            >
              {[...carouselMembers].sort((a, b) => {
                const aIsMe = a.id === profile?.id;
                const bIsMe = b.id === profile?.id;
                const aAnswer = aIsMe ? mySubmittedAnswer : (memberAnswers.get(a.id) ?? '');
                const bAnswer = bIsMe ? mySubmittedAnswer : (memberAnswers.get(b.id) ?? '');
                const aHas = !!aAnswer;
                const bHas = !!bAnswer;
                // Before answering, keep the user's entry point first. After answering,
                // their card joins the normal recency queue with everyone else.
                if (aIsMe && !aHas) return -1;
                if (bIsMe && !bHas) return 1;
                if (aHas && !bHas) return -1;
                if (!aHas && bHas) return 1;
                if (aHas && bHas) {
                  const aTs = answerTimestamps.get(a.id) ?? '';
                  const bTs = answerTimestamps.get(b.id) ?? '';
                  return bTs.localeCompare(aTs); // most recent first
                }
                if (aIsMe) return -1;
                if (bIsMe) return 1;
                return 0;
              }).map((member) => {
                const isMe = member.id === profile?.id;
                const firstName = member.name.split(' ')[0];
                const memberAnswer = isMe ? mySubmittedAnswer : (memberAnswers.get(member.id) ?? '');
                const hasAnswered = !!memberAnswer;
                const isExpanded = expandedAnswerId === member.id;
                const imgOpacity = isMe ? 1 : hasAnswered ? 1 : 0.45;
                return (
                  <View key={member.id} style={{ width: isExpanded ? 180 : 74, alignItems: 'center' }}>
                    {/* Avatar → member profile */}
                    <Pressable
                      onPress={() => {
                        setExpandedAnswerId(null);
                        router.push(isMe ? '/profile' : { pathname: '/(app)/members', params: { memberId: member.id } });
                      }}
                      style={{ alignItems: 'center', width: '100%' }}
                    >
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
                    </Pressable>

                    {/* Name / answer affordance */}
                    <Pressable
                      onPress={() => {
                        if (isMe && !hasAnswered) {
                          openAnswerModal({ question: todayQuestion, index: todayIndex, dateKey: todayDateKey }, '');
                          return;
                        }
                        if (isMe) {
                          router.push('/profile');
                        } else {
                          setExpandedAnswerId(null);
                          router.push({ pathname: '/(app)/members', params: { memberId: member.id } });
                        }
                      }}
                      style={{ width: '100%' }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: isMe && !hasAnswered ? '#bd9348' : hasAnswered ? '#2d2d2d' : '#b0a898', textAlign: 'center', marginBottom: 5 }} numberOfLines={1}>
                        {isMe && !hasAnswered ? 'Answer' : firstName}
                      </Text>
                    </Pressable>

                    {/* Answer bubble → expand full answer (or placeholder) */}
                    {hasAnswered ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          setExpandedAnswerId(isExpanded ? null : member.id);
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? '#fdf3dc' : 'white',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isExpanded ? '#bd9348' : '#c49a3c',
                          padding: isExpanded ? 9 : 6,
                          width: isExpanded ? 180 : 74,
                          shadowColor: '#bd9348',
                          shadowOpacity: isExpanded ? 0.12 : 0,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: isExpanded ? 2 : 0,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: isExpanded ? 11 : 9, color: '#4b5563', lineHeight: isExpanded ? 16 : 13 }} numberOfLines={isExpanded ? undefined : 4}>
                          {memberAnswer}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={isMe ? () => openAnswerModal({ question: todayQuestion, index: todayIndex, dateKey: todayDateKey }, '') : undefined}
                        style={({ pressed }) => ({
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isMe ? 'rgba(189,147,72,0.4)' : 'rgba(222,193,129,0.25)',
                          borderStyle: 'dashed',
                          padding: 5,
                          width: 74,
                          alignItems: 'center',
                          backgroundColor: isMe && pressed ? '#fdf3dc' : 'transparent',
                        })}
                      >
                        <Text style={{ fontSize: 13 }}>{isMe ? '✍️' : '💭'}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>

          </View>
        </View>

        {/* Main Content */}
        <View className="p-4" onTouchStart={() => setExpandedAnswerId(null)}>

        {homeIsUpdating && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#fffdf5',
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: useMobileLayout ? 12 : 16,
              shadowColor: '#bd9348',
              shadowOpacity: 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }}
          >
            <ActivityIndicator size="small" color="#bd9348" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                Clive is gathering the latest HIVE buzz...
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7b6b59', marginTop: 2 }}>
                Pulling activity, events, questions, and your to-dos.
              </Text>
            </View>
          </View>
        )}

        {useMobileLayout && (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginBottom: 28,
            }}
          >
            <Pressable
              onPress={onRefresh}
              disabled={refreshing || isLoading}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                borderWidth: 1,
                borderColor: 'rgba(222,193,129,0.7)',
                borderRadius: 999,
                paddingVertical: 10,
                alignItems: 'center',
                opacity: refreshing || isLoading ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                ↻ Refresh
              </Text>
            </Pressable>
            <Pressable
              onPress={showPhoneInstallHelp}
              style={({ pressed }) => ({
                flex: 1.4,
                backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                borderWidth: 1,
                borderColor: 'rgba(222,193,129,0.7)',
                borderRadius: 999,
                paddingVertical: 10,
                alignItems: 'center',
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                □↑ Add to Home
              </Text>
            </Pressable>
          </View>
        )}

        {/* Activity · My To Do List · Upcoming Events */}
        <View style={{ flexDirection: useMobileLayout ? 'column' : 'row', gap: useMobileLayout ? 22 : 16, marginBottom: 24 }}>

          {/* Activity Feed */}
          <View style={dashboardSectionStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 0 }}>
              <View style={{ backgroundColor: '#fdf3dc', borderColor: 'rgba(222,193,129,0.7)', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d' }}>
                  Activity
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
                {hasUnreadActivity && (
                <Pressable
                  onPress={markAllActivityRead}
                  className="active:opacity-60"
                  style={{ paddingHorizontal: 4 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                    Mark all read
                  </Text>
                </Pressable>
                )}
              </View>
            </View>
            <View style={{
              backgroundColor: '#fffdf5',
              borderRadius: 20,
              borderTopLeftRadius: 0,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              shadowColor: '#bd9348',
              shadowOpacity: 0.16,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 5 },
              elevation: 3,
              overflow: 'hidden',
              height: dashboardPanelHeight,
              position: 'relative',
            }}>
              <ConfettiBurst visible={showActivityConfetti} onDone={() => setShowActivityConfetti(false)} />
              {/* Inner top highlight — liquid glass gloss */}
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.75)', marginHorizontal: 10, marginTop: 0 }} />
              {activityLoading && activityItems.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color="#bd9348" />
                </View>
              ) : activityItems.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#fdf3dc' }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', textAlign: 'center' }}>
                    No recent activity yet.{'\n'}Start by sharing a wish or posting on the board!
                  </Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                  onScroll={handleActivityScroll}
                  scrollEventThrottle={16}
                  refreshControl={<RefreshControl refreshing={isActivityChecking} onRefresh={handleActivityRefresh} tintColor="#bd9348" />}
                >
                  {(isActivityChecking || showActivityPullSpace) && (
                    <View style={{ height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff8e8', borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.24)' }}>
                      <Animated.View style={{ transform: [{ rotate: activityRefreshRotation }] }}>
                        <Text style={{ fontSize: 18, color: '#bd9348', lineHeight: 22 }}>◌</Text>
                      </Animated.View>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', marginTop: 2 }}>
                        {isActivityChecking ? 'Checking activity...' : 'Pull to check activity'}
                      </Text>
                    </View>
                  )}
                  {activityItems.map((item, i) => {
                    const isUnread = item.timestamp > sessionReadAt && !readItemIds.has(item.id);
                    const canNavigate = !!getActivityDestination(item);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => handleActivityPress(item)}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 14,
                          borderBottomWidth: i < activityItems.length - 1 ? 1 : 0,
                          borderBottomColor: 'rgba(222,193,129,0.28)',
                          backgroundColor: isUnread
                            ? pressed ? '#fbf0d7' : '#fff8e8'
                            : pressed ? '#fbf4e3' : '#fffdf5',
                        })}
                      >
                        <View style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isUnread ? 'rgba(222,193,129,0.26)' : 'rgba(222,193,129,0.14)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                          flexShrink: 0,
                        }}>
                          <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                        </View>
                        {isUnread && (
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#bd9348', marginRight: 10, shadowColor: '#bd9348', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: isUnread ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 13, color: isUnread ? '#2d2d2d' : '#756b5f', lineHeight: 18 }}>
                            {item.text}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: isUnread ? '#7b653e' : '#9a8d7c', marginTop: 3 }}>
                            {getRelativeTime(item.timestamp)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6, flexShrink: 0 }}>
                          {canNavigate && (
                            <Text style={{ fontSize: 16, color: isUnread ? 'rgba(143,109,49,0.72)' : 'rgba(189,147,72,0.35)', lineHeight: 20 }}>›</Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {/* My To Do List */}
          <View style={dashboardSectionStyle}>
            <HeaderTabs
              activeTab={todoStatusTab}
              onChange={setTodoStatusTab}
              actionLabel="+ Task"
              onAction={() => { setNewTaskText(''); setTaskError(null); setShowAddTaskModal(true); }}
              compact
              tabs={[
                {
                  key: 'open',
                  label: 'Open To Do',
                  count: openTodos.length,
                },
                {
                  key: 'done',
                  label: 'Done',
                  count: doneTodos.length,
                },
              ]}
            />
            <View style={{
              backgroundColor: '#fffdf5',
              borderRadius: 20,
              borderTopLeftRadius: 0,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              shadowColor: '#bd9348',
              shadowOpacity: 0.16,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 5 },
              elevation: 3,
              overflow: 'hidden',
              height: todoPanelHeight,
              position: 'relative',
            }}>
              <ConfettiBurst visible={showConfetti} onDone={() => setShowConfetti(false)} />
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.75)', marginHorizontal: 10 }} />
              {homeActionLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color="#bd9348" />
                </View>
              ) : visibleTodos.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 4, textAlign: 'center' }}>All clear!</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', textAlign: 'center', lineHeight: 18 }}>
                    {todoStatusTab === 'done'
                      ? 'No completed to-dos yet.'
                      : 'No pending to-dos.'}{'\n'}Meeting action items and{'\n'}monthly check-ins will show up here.
                  </Text>
                </View>
              ) : (
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                  {renderTodoList()}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Upcoming Events */}
          <View style={dashboardSectionStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 0 }}>
              <View style={{ flexShrink: 1, backgroundColor: '#fdf3dc', borderColor: 'rgba(222,193,129,0.7)', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d' }}>
                  Upcoming Events
                </Text>
              </View>
              <HeaderActionPill label="+ Event" onPress={openCreateEvent} />
            </View>
            <View style={{
              backgroundColor: '#fdf3dc',
              borderRadius: 20,
              borderTopLeftRadius: 0,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              shadowColor: '#bd9348',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 5 },
              elevation: 3,
              overflow: 'hidden',
              height: dashboardPanelHeight,
            }}>
              {/* Inner top highlight — liquid glass gloss */}
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.95)', marginHorizontal: 10, marginTop: 0 }} />
              {loading.events ? (
                <View style={{ padding: 16 }}><EventsListSkeleton /></View>
              ) : upcomingEvents.length > 0 ? (
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
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
            onPress={() => router.push('/honey-pot' as any)}
          />
          <HexShortcut
            emoji="📋"
            label="Boards"
            onPress={() => router.push('/board')}
          />
          <HexShortcut
            emoji="💬"
            label="Messages"
            onPress={() => router.push('/messages')}
          />
        </View>

        {/* HD Wishes */}
        <View style={{ marginBottom: 24 }}>
          <HeaderTabs
            activeTab={wishStatusTab}
            onChange={setWishStatusTab}
            actionLabel="+ Wish"
            onAction={() => setShowAddWishModal(true)}
            compact={useMobileLayout}
            tabs={[
              {
                key: 'public',
                label: 'Open HD',
                count: publicWishes.length,
              },
              {
                key: 'granted',
                label: 'Granted',
                count: grantedWishes.length,
              },
            ]}
          />

          {loading.publicWishes && loading.grantedWishes ? (
            <View style={{
              backgroundColor: '#fdf3dc',
              borderRadius: 20,
              borderTopLeftRadius: 0,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              shadowColor: '#bd9348',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 5 },
              elevation: 3,
              height: wishPanelHeight,
              overflow: 'hidden',
              padding: 12,
            }}>
              <WishSectionSkeleton />
            </View>
          ) : (
            <View style={{
              backgroundColor: '#fdf3dc',
              borderRadius: 20,
              borderTopLeftRadius: 0,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              shadowColor: '#bd9348',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 5 },
              elevation: 3,
              height: wishPanelHeight,
              overflow: 'hidden',
            }}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  padding: 12,
                  paddingBottom: 12,
                  flexGrow: visibleHdWishes.length === 0 ? 1 : undefined,
                }}
              >
                {visibleHdWishes.length === 0 ? (
                  <View className="bg-white rounded-xl p-6 shadow-sm items-center">
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                      {hdWishesEmptyText}
                    </Text>
                  </View>
                ) : (
                  visibleHdWishes.map((wish) => (
                    <WishCard
                      key={wish.id}
                      wish={wish}
                      onPress={() => openWishDetail(wish)}
                      canEdit={canOpenWishActions(wish)}
                      canDelete={canDeleteWish(wish)}
                      onManage={() => setManagingWish(wish)}
                    />
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>

        </View>
      </ScrollView>

      {/* Add/Edit/View Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent onRequestClose={() => setShowEventModal(false)}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setShowEventModal(false)}>
          <Pressable className="bg-white rounded-t-3xl p-6" onPress={(e) => e.stopPropagation()}>
            {(() => {
              const canEdit = !!profile && !!communityId;
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
                        returnKeyType="send"
                        onSubmitEditing={saveEvent}
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
                          placeholder="7:30 PM"
                          value={eventTime}
                          onChangeText={setEventTime}
                          returnKeyType="send"
                          onSubmitEditing={saveEvent}
                          className="border border-gray-300 rounded-lg px-4 py-3 text-base bg-cream"
                        />
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mt-1">
                          Extra details like doors/showtime can go here too. We’ll save the first time and keep your note.
                        </Text>
                      </View>
                      <TextInput
                        placeholder="Location (optional)"
                        value={eventLocation}
                        onChangeText={setEventLocation}
                        returnKeyType="send"
                        onSubmitEditing={saveEvent}
                        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-3"
                      />
                      <TextInput
                        placeholder="Description (optional)"
                        value={eventDescription}
                        onChangeText={setEventDescription}
                        multiline
                        blurOnSubmit={false}
                        onKeyPress={submitOnEnter(saveEvent)}
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!managingWish} animationType="fade" transparent onRequestClose={() => setManagingWish(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' }}
          onPress={() => setManagingWish(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: '#fffdf5',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 22,
              paddingBottom: 34,
              borderTopWidth: 1,
              borderColor: 'rgba(222,193,129,0.5)',
            }}
          >
            <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.28)', borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d' }}>
                  Manage Wish
                </Text>
                {managingWish ? (
                  <Text
                    numberOfLines={2}
                    style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: '#8a7760', marginTop: 4 }}
                  >
                    {managingWish.description}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setManagingWish(null)}
                accessibilityRole="button"
                accessibilityLabel="Close wish actions"
                hitSlop={8}
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff8e8' }}
              >
                <Ionicons name="close-outline" size={22} color="#8e7a5e" />
              </Pressable>
            </View>

            {managingWish && canGrantWish(managingWish) ? (
              <Pressable
                onPress={() => {
                  const wish = managingWish;
                  setManagingWish(null);
                  setWishToGrant(wish);
                }}
                style={manageWishActionStyle('gold')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={manageWishToneColor('gold')} />
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: manageWishToneColor('gold') }}>
                    Grant
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(189,147,72,0.55)" />
              </Pressable>
            ) : null}

            {managingWish && canLinkWishBoard(managingWish) ? (
              <Pressable
                onPress={() => {
                  const wish = managingWish;
                  setManagingWish(null);
                  if (wish.board_category_id || wish.source_board_post_id) {
                    handleUnlinkWishFromBoard(wish);
                  } else {
                    createBoardFromWish(wish);
                  }
                }}
                style={manageWishActionStyle('gold')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons
                    name={managingWish.board_category_id || managingWish.source_board_post_id ? 'unlink-outline' : 'albums-outline'}
                    size={18}
                    color={manageWishToneColor('gold')}
                  />
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: manageWishToneColor('gold') }}>
                    {managingWish.board_category_id || managingWish.source_board_post_id
                      ? 'Unlink HD board'
                      : 'Link to my HD board'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(189,147,72,0.55)" />
              </Pressable>
            ) : null}

            {managingWish && canEditWish(managingWish) ? (
              <Pressable
                onPress={() => {
                  const wish = managingWish;
                  setManagingWish(null);
                  setEditingWish(wish);
                }}
                style={manageWishActionStyle('neutral')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="pencil-outline" size={18} color={manageWishToneColor('neutral')} />
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: manageWishToneColor('neutral') }}>
                    Edit
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
              </Pressable>
            ) : null}

            {managingWish && canArchiveWish(managingWish) ? (
              <Pressable
                onPress={() => {
                  const wish = managingWish;
                  setManagingWish(null);
                  handleArchiveWish(wish);
                }}
                style={manageWishActionStyle('neutral')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="archive-outline" size={18} color={manageWishToneColor('neutral')} />
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: manageWishToneColor('neutral') }}>
                    Archive
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
              </Pressable>
            ) : null}

            {managingWish && canDeleteWish(managingWish) ? (
              <Pressable
                onPress={() => {
                  const wish = managingWish;
                  setManagingWish(null);
                  handleDeleteWish(wish);
                }}
                style={manageWishActionStyle('danger')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={manageWishToneColor('danger')} />
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: manageWishToneColor('danger') }}>
                    Delete
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(239,68,68,0.45)" />
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <AddWishModal
        visible={!!editingWish}
        onClose={() => setEditingWish(null)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleEditWishSave}
        existingWish={editingWish}
      />

      <AddWishModal
        visible={showAddWishModal}
        onClose={() => setShowAddWishModal(false)}
        communityId={communityId}
        userId={profile?.id}
        onSave={async () => { setShowAddWishModal(false); await refetch(); }}
        onRefineWithClive={(roughWish) => {
          setShowAddWishModal(false);
          router.push({ pathname: '/', params: { prefill: `I want to wish for: ${roughWish}` } });
        }}
      />

      {wishToGrant && (
        <GrantWishModal
          visible={!!wishToGrant}
          onClose={() => setWishToGrant(null)}
          wish={wishToGrant}
          communityId={communityId}
          onGrant={handleGrantWish}
        />
      )}

      {/* Add Task Modal */}
      <Modal visible={showAddTaskModal} animationType="slide" transparent onRequestClose={() => setShowAddTaskModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }} onPress={() => setShowAddTaskModal(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d', marginBottom: 4 }}>Add a Task</Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginBottom: 16 }}>Add something to your personal to-do list</Text>
            <TextInput
              value={newTaskText}
              onChangeText={(text) => {
                setNewTaskText(text);
                if (taskError) setTaskError(null);
              }}
              placeholder="What do you need to do?"
              placeholderTextColor="#9ca3af"
              multiline
              blurOnSubmit={false}
              onKeyPress={submitOnEnter(handleAddTask)}
              autoFocus
              maxLength={300}
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 15,
                color: '#2d2d2d',
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(189,147,72,0.35)',
                padding: 14,
                minHeight: 90,
                textAlignVertical: 'top',
                marginBottom: 16,
              }}
            />
            {taskError ? (
              <View style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626', textAlign: 'center' }}>
                  {taskError}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={handleAddTask}
              disabled={savingTask || !newTaskText.trim()}
              style={({ pressed }) => ({
                backgroundColor: newTaskText.trim() ? '#bd9348' : '#e5e7eb',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: newTaskText.trim() ? 'white' : '#9ca3af' }}>
                {savingTask ? 'Saving...' : 'Add Task'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Task Detail Modal */}
      <Modal visible={!!selectedActionItem} animationType="slide" transparent onRequestClose={() => setSelectedActionItemId(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }} onPress={() => setSelectedActionItemId(null)}>
          <Pressable
            onPress={event => event.stopPropagation()}
            style={{
              backgroundColor: '#fffdf5',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: useMobileLayout ? 40 : 28,
              maxHeight: useMobileLayout ? '78%' : '68%',
            }}
          >
            <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            {selectedActionItem ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d', marginBottom: 4 }}>Task</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060' }}>
                      {selectedActionItem.completed
                        ? `Completed${selectedActionItem.completed_at ? ` · ${formatDateShort(selectedActionItem.completed_at)}` : ''}`
                        : selectedActionItem.due_date ? `Due ${formatDateShort(selectedActionItem.due_date)}` : 'On your personal to-do list'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setSelectedActionItemId(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close task details"
                    hitSlop={8}
                    style={({ pressed }) => ({
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? '#f2e1bd' : '#fff8e8',
                      borderWidth: 1,
                      borderColor: 'rgba(189,147,72,0.24)',
                    })}
                  >
                    <Ionicons name="close" size={18} color="#8e6f35" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator style={{ maxHeight: useMobileLayout ? 260 : 220, marginBottom: 18 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', lineHeight: 24 }}>
                    {selectedActionItem.description}
                  </Text>
                </ScrollView>

                <View style={{ gap: 10 }}>
                  <Pressable
                    onPress={() => toggleActionItem(selectedActionItem)}
                    accessibilityRole="button"
                    accessibilityLabel={selectedActionItem.completed ? 'Mark task open' : 'Mark task complete'}
                    style={({ pressed }) => ({
                      backgroundColor: selectedActionItem.completed ? '#fff8e8' : '#bd9348',
                      borderColor: selectedActionItem.completed ? 'rgba(189,147,72,0.36)' : '#bd9348',
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingVertical: 13,
                      paddingHorizontal: 14,
                      alignItems: 'center',
                      opacity: pressed ? 0.78 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: selectedActionItem.completed ? '#8e6f35' : 'white' }}>
                      {selectedActionItem.completed ? 'Mark Open' : 'Mark Complete'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => archiveActionItem(selectedActionItem)}
                    accessibilityRole="button"
                    accessibilityLabel="Archive task"
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? '#fdf2f2' : '#fffdf5',
                      borderColor: 'rgba(239,68,68,0.22)',
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingVertical: 13,
                      paddingHorizontal: 14,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    })}
                  >
                    <Ionicons name="archive-outline" size={16} color="#b91c1c" />
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#b91c1c' }}>Archive</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Phone Home Screen Guide */}
      <Modal visible={showAddHomeGuide} animationType="slide" transparent onRequestClose={() => setShowAddHomeGuide(false)}>
        <Pressable
          onPress={() => setShowAddHomeGuide(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: useMobileLayout ? 34 : 24,
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 8 }}>
                Add HIVE to your Home Screen
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 16 }}>
                iPhone keeps this inside the browser share menu. HIVE can guide you there, but the final Add to Home Screen button has to come from Safari.
              </Text>

              {[
                'Open app.the-hive.app in Safari.',
                'Tap the share icon, the box with an up arrow.',
                'Scroll down and tap Add to Home Screen.',
                'Tap Add, then HIVE will live like an app on your phone.',
              ].map((step, index) => (
                <View
                  key={step}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    backgroundColor: '#fffdf5',
                    borderWidth: 1,
                    borderColor: 'rgba(222,193,129,0.65)',
                    borderRadius: 16,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fdf3dc', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>{index + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: 'Lato_700Bold', fontSize: 14, color: '#3f3a34', lineHeight: 20 }}>
                    {step}
                  </Text>
                </View>
              ))}

              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8a8175', lineHeight: 18, marginTop: 2, marginBottom: 14 }}>
                If that option does not appear, open HIVE directly in Safari first. Some in-app browsers and Chrome on iPhone hide it.
              </Text>

              <Pressable
                onPress={() => setShowAddHomeGuide(false)}
                style={{ backgroundColor: '#bd9348', borderRadius: 16, paddingVertical: 14 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                  Got it
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Daily Question Catch-Up Modal */}
      <Modal visible={showCatchUpModal} animationType="slide" transparent onRequestClose={() => setShowCatchUpModal(false)}>
        <Pressable
          onPress={() => setShowCatchUpModal(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: useMobileLayout ? '72%' : '82%',
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
                Catch up
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 14 }}>
                Answer the questions you missed this week, or peek at the days you already joined.
              </Text>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                style={{ maxHeight: useMobileLayout ? 470 : 620 }}
                contentContainerStyle={{ paddingBottom: 2 }}
              >
                {recentDailyQuestions.map((item, index) => {
                  const answersForDate = recentAnswerMaps.get(item.dateKey) ?? new Map<string, string>();
                  const myPastAnswer = profile?.id ? answersForDate.get(profile.id) ?? '' : '';
                  const answerCount = answersForDate.size;
                  const date = new Date(`${item.dateKey}T00:00:00`);
                  const dateLabel = index === 0
                    ? 'Today'
                    : index === 1
                      ? 'Yesterday'
                      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                  return (
                    <Pressable
                      key={item.dateKey}
                      onPress={() => {
                        setShowCatchUpModal(false);
                        openAnswerModal(item, myPastAnswer);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? '#fce8b0' : '#fffdf5',
                        borderWidth: 1,
                        borderColor: myPastAnswer ? 'rgba(189,147,72,0.55)' : 'rgba(222,193,129,0.55)',
                        borderRadius: 16,
                        padding: useMobileLayout ? 12 : 14,
                        marginBottom: 10,
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <Text style={{ fontSize: useMobileLayout ? 22 : 24, lineHeight: 30 }}>{item.question.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', letterSpacing: 0.6 }}>
                              {dateLabel}
                            </Text>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: myPastAnswer ? '#739a88' : '#9ca3af' }}>
                              {myPastAnswer ? 'Answered' : 'Open'}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: useMobileLayout ? 14 : 15, color: '#2d2d2d', lineHeight: useMobileLayout ? 20 : 21 }}>
                            {item.question.text}
                          </Text>
                          {myPastAnswer ? (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#6b7280', lineHeight: 18, marginTop: 8 }} numberOfLines={2}>
                              Your answer: {myPastAnswer}
                            </Text>
                          ) : null}
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#9a8060', marginTop: 8 }}>
                            {answerCount} {answerCount === 1 ? 'answer' : 'answers'} from HIVE
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={() => setShowCatchUpModal(false)}
                style={{ backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14, marginTop: 6 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Daily Question Answer Modal */}
      <Modal visible={showAnswerModal} animationType="slide" transparent onRequestClose={() => setShowAnswerModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 }}>
                {currentAnswerPrompt.question.emoji} {currentAnswerPrompt.question.category.toUpperCase()}
              </Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 15, color: '#2d2d2d', lineHeight: 22, marginBottom: 20 }}>
                {currentAnswerPrompt.question.text}
              </Text>
              {/* Text input + mic */}
              <View style={{ marginBottom: 14, position: 'relative' }}>
                <TextInput
                  value={myAnswer}
                  onChangeText={setMyAnswer}
                  placeholder={isVoiceListening ? '' : 'Share your answer with HIVE...'}
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  blurOnSubmit={false}
                  onKeyPress={submitOnEnter(handleSubmitAnswer)}
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 15,
                    color: '#2d2d2d',
                    borderWidth: isVoiceListening ? 2 : 1,
                    borderColor: isVoiceListening ? '#bd9348' : '#c49a3c',
                    borderRadius: 14,
                    padding: 14,
                    paddingRight: 48,
                    paddingBottom: isVoiceListening ? 38 : 14,
                    minHeight: 100,
                    textAlignVertical: 'top',
                    backgroundColor: isVoiceListening ? '#fffbf0' : '#fffbf0',
                    shadowColor: isVoiceListening ? '#bd9348' : 'transparent',
                    shadowOpacity: isVoiceListening ? 0.35 : 0,
                    shadowRadius: isVoiceListening ? 10 : 0,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
                {/* Listening indicator strip inside the box */}
                {isVoiceListening && (
                  <View style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 14,
                    right: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Animated.View style={{
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                      backgroundColor: '#bd9348',
                      opacity: voicePulse,
                    }} />
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', letterSpacing: 0.5 }}>
                      Listening…
                    </Text>
                  </View>
                )}
                <VoiceMicButton
                  onTranscript={(text) => setMyAnswer(prev => prev ? prev + ' ' + text : text)}
                  onListeningChange={setIsVoiceListening}
                  size={20}
                  style={{ position: 'absolute', bottom: 10, right: 10 }}
                />
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9ca3af', marginBottom: 14, marginTop: -6 }}>
                Press Enter to send · Shift+Enter for a new line
              </Text>
              {answerError ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>
                  {answerError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setShowAnswerModal(false);
                    setMyAnswer(getMyAnswerForPrompt(currentAnswerPrompt));
                    setAnswerError(null);
                  }}
                  style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitAnswer}
                  style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: myAnswer.trim() && !isSubmittingAnswer ? 1 : 0.4 }}
                  disabled={!myAnswer.trim() || isSubmittingAnswer}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                    {isSubmittingAnswer ? 'Saving...' : 'Share with HIVE 🐝'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Survey Modal */}
      {activeSurvey && (
        <SurveyModal
          survey={activeSurvey}
          initialAnswers={activeSurveyIsEditing ? activeSurveyResponse?.answers : undefined}
          isEditingResponse={activeSurveyIsEditing}
          carryForwardItems={carryForwardItems}
          carryForwardLoading={carryForwardLoading}
          carryForwardError={carryForwardError}
          onSubmit={handleSurveySubmit}
          onClose={closeSurvey}
        />
      )}
    </SafeAreaView>
  );
}

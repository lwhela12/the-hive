import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Image, useWindowDimensions, Pressable, Linking, Modal, TextInput, Alert, Platform, ActivityIndicator, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceMicButton } from '../../components/ui/VoiceMicButton';
import Svg, { Polygon } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useHiveDataQuery } from '../../lib/hooks/useHiveDataQuery';
import { useWishes } from '../../lib/hooks/useWishes';
import { useActivityFeed } from '../../lib/hooks/useActivityFeed';
import { useSurveys } from '../../lib/hooks/useSurveys';
import { SurveyModal } from '../../components/surveys/SurveyModal';
import { WishCard } from '../../components/hive/WishCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import {
  EventsListSkeleton,
  WishSectionSkeleton,
} from '../../components/hive/skeletons';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { getQuestionForDate, getTodayQuestion } from '../../lib/dailyQuestions';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { formatDateShort, formatDateLong, formatTime, parseAmericanDate } from '../../lib/dateUtils';
import { ConfettiBurst } from '../../components/ui/ConfettiBurst';
import type { Profile, Wish, WishGranter, Event, ActionItem } from '../../types';

type WishTab = 'open' | 'granted';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter?: Profile })[];
};

type HomeTodo = {
  id: string;
  emoji: string;
  title: string;
  detail?: string;
  cta?: string;
  onPress?: () => void;
  onComplete?: () => void;
};

const INITIAL_EVENTS_SHOWN = 3;

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
          onPress={() => {
            if (event.event_type !== 'birthday') onEditEvent(event);
          }}
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
  const { profile, communityId, communityRole } = useAuth();
  const router = useRouter();
  const { totalUnread: unreadDMCount } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;

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
  const [showAddWishModal, setShowAddWishModal] = useState(false);
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
  const [homeActionItems, setHomeActionItems] = useState<ActionItem[]>([]);
  const [homeActionLoading, setHomeActionLoading] = useState(false);

  const fetchMyActionItems = useCallback(async () => {
    if (!profile?.id || !communityId) return;
    setHomeActionLoading(true);
    const { data } = await supabase
      .from('action_items')
      .select('*')
      .eq('assigned_to', profile.id)
      .eq('community_id', communityId)
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false });
    setHomeActionItems((data ?? []) as ActionItem[]);
    setHomeActionLoading(false);
  }, [profile?.id, communityId]);

  useEffect(() => { fetchMyActionItems(); }, [fetchMyActionItems]);

  const [showConfetti, setShowConfetti] = useState(false);
  const [showGoodJob, setShowGoodJob] = useState(false);
  const goodJobOpacity = useRef(new Animated.Value(0)).current;
  const [completedTodoIds, setCompletedTodoIds] = useState<Set<string>>(new Set());
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const triggerCompletion = useCallback(() => {
    setShowConfetti(true);
    setShowGoodJob(true);
    goodJobOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(goodJobOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(goodJobOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowGoodJob(false));
  }, [goodJobOpacity]);

  const completeActionItem = useCallback(async (id: string) => {
    triggerCompletion();
    setCompletedTodoIds(prev => new Set([...prev, `action-${id}`]));
    await supabase
      .from('action_items')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', id);
  }, [triggerCompletion]);

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

  // Activity feed
  const { items: activityItems, loading: activityLoading, refetch: refetchActivity } = useActivityFeed(communityId ?? undefined);

  // Read state — timestamp-based (for auto-clear) + per-item set (for tap-to-clear)
  const activityReadKey = communityId ? `the-hive:activity-viewed:${communityId}` : null;
  const activityReadIdsKey = communityId ? `the-hive:activity-read-ids:${communityId}` : null;

  const [sessionReadAt, setSessionReadAt] = useState<string>(() => {
    if (typeof window !== 'undefined' && activityReadKey) {
      return window.localStorage.getItem(activityReadKey) ?? new Date(0).toISOString();
    }
    return new Date(0).toISOString();
  });

  const [readItemIds, setReadItemIds] = useState<Set<string>>(new Set());
  const [showActivityConfetti, setShowActivityConfetti] = useState(false);
  const [showActivityCaughtUp, setShowActivityCaughtUp] = useState(false);
  const [isActivityChecking, setIsActivityChecking] = useState(false);
  const [showActivityPullSpace, setShowActivityPullSpace] = useState(false);
  const [activityCaughtUpDetail, setActivityCaughtUpDetail] = useState('Nothing new needs you right now.');
  const activityCaughtUpOpacity = useRef(new Animated.Value(0)).current;
  const activityRefreshSpin = useRef(new Animated.Value(0)).current;
  const activityRefreshRotation = activityRefreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const triggerActivityCaughtUp = useCallback((detail = 'Nothing new needs you right now.') => {
    setActivityCaughtUpDetail(detail);
    setShowActivityConfetti(true);
    setShowActivityCaughtUp(true);
    activityCaughtUpOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(activityCaughtUpOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(activityCaughtUpOpacity, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start(() => setShowActivityCaughtUp(false));
  }, [activityCaughtUpOpacity]);

  // Load per-item read IDs from localStorage once communityId is known
  useEffect(() => {
    if (!activityReadIdsKey || typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(activityReadIdsKey);
      if (stored) setReadItemIds(new Set(JSON.parse(stored)));
    } catch {}
  }, [activityReadIdsKey]);

  const markItemRead = useCallback((itemId: string) => {
    setReadItemIds(prev => {
      const next = new Set(prev);
      next.add(itemId);
      if (activityReadIdsKey && typeof window !== 'undefined') {
        window.localStorage.setItem(activityReadIdsKey, JSON.stringify([...next]));
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
      triggerActivityCaughtUp('Everything is read.');
    }
    if (typeof window !== 'undefined') {
      if (activityReadKey) window.localStorage.setItem(activityReadKey, now);
      if (activityReadIdsKey) window.localStorage.removeItem(activityReadIdsKey);
    }
  }, [activityReadKey, activityReadIdsKey, hasUnreadActivity, triggerActivityCaughtUp]);

  const navigateFromActivityItem = useCallback((item: import('../../lib/hooks/useActivityFeed').ActivityItem) => {
    if (item.navigatesTo === 'board') {
      // Pre-set the board's localStorage keys so it opens directly to the right post
      if (communityId && typeof window !== 'undefined') {
        if (item.categoryId) {
          window.localStorage.setItem(`the-hive:last-board-category:${communityId}`, item.categoryId);
        }
        window.localStorage.setItem(`the-hive:last-board-post:${communityId}`, item.sourceId);
        window.localStorage.setItem(`the-hive:board-direct-open:${communityId}`, 'true');
      }
      router.push('/board');
    } else if (item.navigatesTo === 'members') {
      router.push('/members');
    }
  }, [communityId, router]);

  const handleActivityPress = useCallback((item: import('../../lib/hooks/useActivityFeed').ActivityItem) => {
    const wasUnread = item.timestamp > sessionReadAt && !readItemIds.has(item.id);
    const clearsLastUnread = wasUnread && unreadActivityCount === 1;

    if (wasUnread) {
      markItemRead(item.id);
    }

    if (clearsLastUnread) {
      triggerActivityCaughtUp('You cleared the activity stack.');
      if (item.navigatesTo) {
        setTimeout(() => navigateFromActivityItem(item), 700);
        return;
      }
    }

    navigateFromActivityItem(item);
  }, [markItemRead, navigateFromActivityItem, readItemIds, sessionReadAt, triggerActivityCaughtUp, unreadActivityCount]);

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
        triggerActivityCaughtUp('Nothing new since you last checked.');
      }
    } finally {
      spin.stop();
      activityRefreshSpin.stopAnimation();
      setIsActivityChecking(false);
      setTimeout(() => setShowActivityPullSpace(false), 420);
    }
  }, [activityItems, activityRefreshSpin, readItemIds, refetchActivity, sessionReadAt, triggerActivityCaughtUp]);

  // Member carousel state
  const [carouselMembers, setCarouselMembers] = useState<{ id: string; name: string; avatar_url?: string | null; role: string }[]>([]);

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

  // Surveys
  const { pendingSurveys, submitResponse } = useSurveys(communityId ?? undefined, profile?.id);
  const [activeSurvey, setActiveSurvey] = useState<import('../../lib/hooks/useSurveys').Survey | null>(null);

  // For granting wishes
  const { grantWish } = useWishes();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), handleActivityRefresh(), fetchTodayAnswers(), fetchRecentAnswers(), fetchMyActionItems()]);
    } finally {
      setRefreshing(false);
    }
  };

  const showPhoneInstallHelp = useCallback(() => {
    setShowAddHomeGuide(true);
  }, []);

  const homeIsUpdating = refreshing || isLoading || activityLoading || homeActionLoading;

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

  const homeTodos: HomeTodo[] = [
    ...pendingSurveys.map(s => ({
      id: `survey-${s.id}`,
      emoji: '📋',
      title: s.title,
      detail: s.due_date
        ? `Due ${new Date(s.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Awaiting your response',
      cta: 'Fill out →',
      onPress: () => setActiveSurvey(s),
    })),
    ...homeActionItems.map(a => ({
      id: `action-${a.id}`,
      emoji: '✅',
      title: a.description,
      detail: a.due_date ? `Due ${formatDateShort(a.due_date)}` : undefined,
      onComplete: () => completeActionItem(a.id),
    })),
    ...(() => {
      const nextMeeting = upcomingEvents.find(e => e.event_type === 'meeting');
      if (!nextMeeting) return [];
      const start = getEventStartDate(nextMeeting);
      const msUntil = start.getTime() - Date.now();
      if (msUntil > 0 && msUntil < 7 * 24 * 60 * 60 * 1000) {
        return [{ id: 'donation-reminder', emoji: '🍯', title: 'Bring your monthly donation', detail: `Meeting · ${formatDateShort(nextMeeting.event_date)}`, onComplete: () => { triggerCompletion(); setCompletedTodoIds(prev => new Set([...prev, 'donation-reminder'])); } }];
      }
      return [];
    })(),
  ];

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
      <AppHeader
        title="H.I.V.E."
        onMenuPress={useMobileLayout ? () => setDrawerOpen(true) : undefined}
      />

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
        <View style={{ flexDirection: useMobileLayout ? 'column' : 'row', gap: useMobileLayout ? 30 : 16, marginBottom: 24 }}>

          {/* Activity Feed */}
          <View style={{ flex: 1 }}>
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
              height: 280,
              position: 'relative',
            }}>
              <ConfettiBurst visible={showActivityConfetti} onDone={() => setShowActivityConfetti(false)} />
              {showActivityCaughtUp && (
                <Animated.View style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 12,
                  opacity: activityCaughtUpOpacity,
                  pointerEvents: 'none',
                }}>
                  <View style={{
                    backgroundColor: '#bd9348',
                    borderRadius: 18,
                    paddingHorizontal: 18,
                    paddingVertical: 11,
                    alignItems: 'center',
                    shadowColor: '#bd9348',
                    shadowOpacity: 0.36,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 7,
                  }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>You're all caught up!</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{activityCaughtUpDetail}</Text>
                  </View>
                </Animated.View>
              )}
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
                  showsVerticalScrollIndicator={false}
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
                    const canNavigate = !!item.navigatesTo;
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
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 0 }}>
              <View style={{ flexShrink: 1, backgroundColor: '#fdf3dc', borderColor: 'rgba(222,193,129,0.7)', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d' }}>
                  My To Do List{homeTodos.length > 0 ? ` (${homeTodos.length})` : ''}
                </Text>
              </View>
              <HeaderActionPill
                label="+ Task"
                onPress={() => { setNewTaskText(''); setTaskError(null); setShowAddTaskModal(true); }}
              />
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
              height: 280,
              position: 'relative',
            }}>
              <ConfettiBurst visible={showConfetti} onDone={() => setShowConfetti(false)} />
              {showGoodJob && (
                <Animated.View style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  opacity: goodJobOpacity,
                  pointerEvents: 'none',
                }}>
                  <View style={{ backgroundColor: '#bd9348', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#bd9348', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
                    <Text style={{ fontSize: 18 }}>🎉</Text>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: 'white' }}>Good job!</Text>
                  </View>
                </Animated.View>
              )}
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.75)', marginHorizontal: 10 }} />
              {homeActionLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color="#bd9348" />
                </View>
              ) : homeTodos.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 4, textAlign: 'center' }}>All clear!</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', textAlign: 'center', lineHeight: 18 }}>
                    No pending to-dos.{'\n'}Meeting action items and{'\n'}surveys will show up here.
                  </Text>
                </View>
              ) : (
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {[
                    ...homeTodos.filter(t => !completedTodoIds.has(t.id)),
                    ...homeTodos.filter(t => completedTodoIds.has(t.id)),
                  ].map((todo, i, all) => {
                    const isDone = completedTodoIds.has(todo.id);
                    return (
                    <Pressable
                      key={todo.id}
                      onPress={isDone ? undefined : (todo.onPress ?? todo.onComplete)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderBottomWidth: i < all.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(222,193,129,0.28)',
                        backgroundColor: pressed && !isDone && (todo.onPress || todo.onComplete) ? '#fbf4e3' : '#fffdf5',
                        gap: 10,
                        opacity: isDone ? 0.45 : 1,
                      })}
                    >
                      <View style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: isDone ? '#bd9348' : 'rgba(189,147,72,0.48)',
                        backgroundColor: isDone ? '#bd9348' : 'rgba(255,255,255,0.62)',
                        flexShrink: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {isDone && <Text style={{ color: 'white', fontSize: 12, lineHeight: 14 }}>✓</Text>}
                      </View>
                      <Text style={{ fontSize: 18, flexShrink: 0 }}>{todo.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: isDone ? '#9a8060' : '#2d2d2d', lineHeight: 18, textDecorationLine: isDone ? 'line-through' : 'none' }} numberOfLines={2}>
                          {todo.title}
                        </Text>
                        {todo.detail ? (
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060', marginTop: 2 }}>
                            {isDone ? 'Done' : todo.detail}
                          </Text>
                        ) : null}
                      </View>
                      {!isDone && todo.cta ? (
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', flexShrink: 0 }}>{todo.cta}</Text>
                      ) : null}
                    </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Upcoming Events */}
          <View style={{ flex: 1 }}>
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
              height: 280,
            }}>
              {/* Inner top highlight — liquid glass gloss */}
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.95)', marginHorizontal: 10, marginTop: 0 }} />
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
          <View style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ alignSelf: 'flex-start', flexShrink: 1, backgroundColor: '#fdf3dc', borderColor: 'rgba(222,193,129,0.7)', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 14, paddingVertical: 7 }}>
              <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: useMobileLayout ? 16 : 17, color: '#2d2d2d' }}>
                Community Wishes
              </Text>
            </View>
            <HeaderActionPill label="+ Wish" onPress={() => setShowAddWishModal(true)} />
          </View>

          {loading.publicWishes && loading.grantedWishes ? (
            <WishSectionSkeleton />
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
              padding: 12,
            }}>
              {/* Tabs */}
              <View style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: '#fff8e8', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)' }}>
                <Pressable
                  onPress={() => setWishTab('open')}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 9,
                    backgroundColor: wishTab === 'open' ? '#ffffff' : 'transparent',
                    shadowColor: wishTab === 'open' ? '#bd9348' : 'transparent',
                    shadowOpacity: wishTab === 'open' ? 0.10 : 0,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 2 },
                  }}
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
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 9,
                    backgroundColor: wishTab === 'granted' ? '#ffffff' : 'transparent',
                    shadowColor: wishTab === 'granted' ? '#bd9348' : 'transparent',
                    shadowOpacity: wishTab === 'granted' ? 0.10 : 0,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 2 },
                  }}
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
            </View>
          )}
        </View>

        </View>
      </ScrollView>

      {/* Add/Edit/View Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent onRequestClose={() => setShowEventModal(false)}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setShowEventModal(false)}>
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
                          placeholder="7:30 PM"
                          value={eventTime}
                          onChangeText={setEventTime}
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
                showsVerticalScrollIndicator={false}
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
                            {answerCount} {answerCount === 1 ? 'answer' : 'answers'} from the HIVE
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
                  placeholder={isVoiceListening ? '' : 'Share your answer with the HIVE...'}
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
          onSubmit={(answers) => submitResponse(activeSurvey.id, answers)}
          onClose={() => setActiveSurvey(null)}
        />
      )}
    </SafeAreaView>
  );
}

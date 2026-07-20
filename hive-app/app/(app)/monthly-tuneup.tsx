import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { invalidateWishQueries, queryClient, queryKeys } from '../../lib/queryClient';
import {
  getStoredItemAsync,
  removeStoredItemAsync,
  setStoredItemAsync,
} from '../../lib/webStorage';
import { deleteWishById } from '../../lib/wishMutations';
import { useAuth } from '../../lib/hooks/useAuth';
import { useWishes } from '../../lib/hooks/useWishes';
import {
  getSurveyResponsePeriod,
  isMonthlyCheckInSurvey,
  useSurveys,
  type SurveyAnswers,
} from '../../lib/hooks/useSurveys';
import { SurveyQuestionField } from '../../components/surveys/SurveyQuestionField';
import { VoiceMicButton } from '../../components/ui/VoiceMicButton';
import { WishCombCard } from '../../components/profile/WishCombCard';
import { WishManageModal } from '../../components/wishes/WishManageModal';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { parseAmericanDate } from '../../lib/dateUtils';
import { submitOnEnter } from '../../lib/submitOnEnter';
import type { Profile, Wish } from '../../types';

const hiveBee = require('../../assets/HIVE Bee.png');

const STEPS = [
  { key: 'wishes', label: 'HD wishes' },
  { key: 'hangs', label: 'Hang ideas' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'helpers', label: 'Helpers' },
  { key: 'checkin', label: 'Check-in' },
] as const;

type BoardTarget = { id: string; name: string };

// The HIVE Helpers board holds one thread per month (e.g. "June Pay It Forward
// Success"); members log helps as replies on the current thread.
type HelperThread = {
  boardId: string;
  boardName: string;
  postId: string | null;
  postTitle: string | null;
};

// Wizard draft persisted across relaunches (per community + member).
type TuneupDraft = {
  savedAt?: number;
  stepIndex?: number;
  helperContent?: string;
  hangTitle?: string;
  hangContent?: string;
  eventTitle?: string;
  eventDate?: string;
  eventEndDate?: string;
  eventAllDay?: boolean;
  eventTime?: string;
  eventLocation?: string;
  checkInAnswers?: Record<string, unknown>;
};

const getTuneupDraftKey = (communityId: string, userId: string) =>
  `the-hive:tuneup-draft:${communityId}:${userId}`;

function getFirstName(name?: string | null) {
  const trimmed = (name ?? '').trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

function getMonthNameFromPeriod(period?: string | null) {
  const match = (period ?? '').match(/^(\d{4})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
    : new Date();
  return date.toLocaleString('en-US', { month: 'long' });
}

// Mirrors the event time normalization in hive.tsx so the tune-up's mini form
// stores the same event_time shape the Home screen expects.
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

function deriveBoardPostTitle(title: string, content: string) {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 59).trim()}…` : clean;
}

const cardStyle = {
  backgroundColor: '#fffdf5',
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(222,193,129,0.5)',
  padding: 16,
} as const;

const inputStyle = {
  backgroundColor: 'white',
  borderWidth: 1,
  borderColor: 'rgba(222,193,129,0.4)',
  borderRadius: 12,
  fontFamily: 'Lato_400Regular',
  fontSize: 14,
  color: '#2d2d2d',
  paddingHorizontal: 14,
  paddingVertical: 10,
} as const;

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
        {title}
      </Text>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#7d715f' }}>
        {subtitle}
      </Text>
    </View>
  );
}

function PostedConfirmation({ lines, boardName }: { lines: string[]; boardName?: string | null }) {
  if (lines.length === 0) return null;
  return (
    <View
      style={{
        backgroundColor: '#ecfdf3',
        borderWidth: 1,
        borderColor: '#86efac',
        borderRadius: 14,
        padding: 12,
        marginTop: 12,
        gap: 4,
      }}
    >
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#166534' }}>
          ✓ Posted{boardName ? ` to ${boardName}` : ''}: {line}
        </Text>
      ))}
    </View>
  );
}

export default function MonthlyTuneupScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { profile, communityId } = useAuth();
  const { wishes, loading: wishesLoading, refresh: refreshWishes, grantWish } = useWishes();
  const {
    availableSurveys,
    pendingSurveys,
    myResponses,
    submitResponse,
    loading: surveysLoading,
  } = useSurveys(communityId ?? undefined, profile?.id);

  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  // Step 1 — HD wishes (same manage wiring as profile.tsx)
  const [managingWish, setManagingWish] = useState<Wish | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [addWishModalVisible, setAddWishModalVisible] = useState(false);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);

  // Steps 2 + 4 — board posts
  const [hangTitle, setHangTitle] = useState('');
  const [hangContent, setHangContent] = useState('');
  const [hangPosting, setHangPosting] = useState(false);
  const [hangError, setHangError] = useState<string | null>(null);
  const [hangPosted, setHangPosted] = useState<string[]>([]);
  const [hangBoardName, setHangBoardName] = useState<string | null>(null);

  const [helperContent, setHelperContent] = useState('');
  const [helperPosting, setHelperPosting] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperPosted, setHelperPosted] = useState<string[]>([]);
  const [helperThread, setHelperThread] = useState<HelperThread | null>(null);

  // Step 3 — calendar
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventsAdded, setEventsAdded] = useState<string[]>([]);

  // Step 5 — check-in questions, inline (one flow, no separate survey modal)
  const [checkInAnswers, setCheckInAnswers] = useState<SurveyAnswers>({});
  const [checkInDirty, setCheckInDirty] = useState(false);
  const [checkInPrefilled, setCheckInPrefilled] = useState(false);
  const [checkInSubmitted, setCheckInSubmitted] = useState(false);
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const monthlyCheckInSurvey = availableSurveys.find(isMonthlyCheckInSurvey) ?? null;
  const pendingSurveyIds = new Set(pendingSurveys.map((survey) => survey.id));
  const checkInResponse = monthlyCheckInSurvey ? myResponses.get(monthlyCheckInSurvey.id) : undefined;
  const checkInIsEditing = !!monthlyCheckInSurvey
    && !!checkInResponse
    && !pendingSurveyIds.has(monthlyCheckInSurvey.id);
  const checkInAlreadyDone = checkInIsEditing || checkInSubmitted;

  // Prefill this month's answers once, without clobbering draft-restored edits.
  useEffect(() => {
    if (checkInPrefilled || checkInDirty) return;
    if (checkInIsEditing && checkInResponse?.answers) {
      setCheckInAnswers(checkInResponse.answers);
      setCheckInPrefilled(true);
    }
  }, [checkInPrefilled, checkInDirty, checkInIsEditing, checkInResponse]);

  const setCheckInAnswer = useCallback((questionId: string, value: any) => {
    setCheckInDirty(true);
    setCheckInAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const monthName = monthlyCheckInSurvey
    ? getMonthNameFromPeriod(getSurveyResponsePeriod(monthlyCheckInSurvey))
    : getMonthNameFromPeriod(null);

  const liveWishes = wishes.filter((wish) => (
    (wish.status === 'public' || wish.status === 'private') && wish.is_active !== false
  ));

  // All wishes on this screen belong to the signed-in member, so the manage
  // permissions collapse to status checks (same rules profile.tsx applies).
  const canGrantWish = useCallback((wish: Wish) => wish.status === 'public', []);
  const canEditWish = useCallback((wish: Wish) => wish.status !== 'fulfilled', []);
  const canArchiveWish = useCallback((wish: Wish) => (
    wish.status === 'public' && wish.is_active !== false
  ), []);
  const canRefineWish = useCallback((wish: Wish) => wish.status !== 'fulfilled', []);

  const findBoardTarget = useCallback(async (kind: 'hangs' | 'helpers'): Promise<BoardTarget | null> => {
    if (!communityId) return null;

    let query = supabase
      .from('board_categories')
      .select('id, name, status')
      .eq('community_id', communityId);

    query = kind === 'hangs'
      ? query.ilike('name', '%hang%')
      : query.or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%');

    const { data, error } = await query;
    if (error) {
      console.warn('Could not find tune-up board', error);
      return null;
    }

    const rows = ((data ?? []) as { id: string; name: string; status?: string | null }[])
      .filter((row) => !row.status || row.status === 'active');
    // Prefer a month-specific board when one exists (e.g. "HIVE Helpers July"),
    // so monthly helper boards route automatically as they're created.
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
    const active = rows.find((row) => row.name.toLowerCase().includes(monthName)) ?? rows[0];
    return active ? { id: active.id, name: active.name } : null;
  }, [communityId]);

  const postToBoard = useCallback(async (title: string, content: string) => {
    if (!profile || !communityId) {
      return { error: 'Your profile is still loading. Please try again in a moment.' };
    }

    const board = await findBoardTarget('hangs');
    if (!board) {
      return {
        error: 'Could not find the HIVE Hangs board. You can post your idea from the Boards tab instead.',
      };
    }

    const { error } = await (supabase as any).from('board_posts').insert({
      community_id: communityId,
      category_id: board.id,
      author_id: profile.id,
      title: deriveBoardPostTitle(title, content),
      content: content.trim(),
    });

    if (error) {
      return { error: `Failed to post: ${error.message}` };
    }

    return { error: null, boardName: board.name };
  }, [communityId, findBoardTarget, profile]);

  // Helpers step posts as a REPLY on the current monthly thread of the HIVE
  // Helpers board (one thread per month, e.g. "June Pay It Forward Success").
  const findHelperThread = useCallback(async (): Promise<HelperThread | null> => {
    if (!communityId) return null;

    const board = await findBoardTarget('helpers');
    if (!board) return null;

    const { data, error } = await supabase
      .from('board_posts')
      .select('id, title, status, created_at')
      .eq('community_id', communityId)
      .eq('category_id', board.id)
      .or('status.is.null,status.eq.active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('Could not load the current HIVE Helpers thread', error);
      return { boardId: board.id, boardName: board.name, postId: null, postTitle: null };
    }

    const thread = ((data ?? []) as { id: string; title: string }[])[0];
    return {
      boardId: board.id,
      boardName: board.name,
      postId: thread?.id ?? null,
      postTitle: thread?.title ?? null,
    };
  }, [communityId, findBoardTarget]);

  // Preload the destination board/thread so steps 2 and 4 can say where posts land.
  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;

    const loadBoardTargets = async () => {
      const [hangBoard, helperThreadInfo] = await Promise.all([
        findBoardTarget('hangs'),
        findHelperThread(),
      ]);
      if (cancelled) return;
      setHangBoardName(hangBoard?.name ?? null);
      setHelperThread(helperThreadInfo);
    };

    void loadBoardTargets();
    return () => {
      cancelled = true;
    };
  }, [communityId, findBoardTarget, findHelperThread]);

  // Wizard progress survives a full relaunch: restore any saved draft once the
  // profile/community are known, save (debounced) on change, clear on finish.
  const draftKey = communityId && profile ? getTuneupDraftKey(communityId, profile.id) : null;
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (!draftKey || draftRestored) return;
    let cancelled = false;

    const restoreDraft = async () => {
      try {
        const raw = await getStoredItemAsync(draftKey);
        if (!cancelled && raw) {
          const draft = JSON.parse(raw) as TuneupDraft;
          if (draft && typeof draft === 'object') {
            // Resume the saved STEP only for a fresh interruption (refresh,
            // crash, token-refresh remount). Coming back hours or days later —
            // e.g. from the reminder email — should start at step 1, with any
            // drafted content still restored below.
            const draftIsFresh = typeof draft.savedAt === 'number'
              && Date.now() - draft.savedAt < 60 * 60 * 1000;
            if (draftIsFresh && typeof draft.stepIndex === 'number' && Number.isFinite(draft.stepIndex)) {
              setStepIndex(Math.min(Math.max(Math.trunc(draft.stepIndex), 0), STEPS.length - 1));
            }
            if (typeof draft.helperContent === 'string') setHelperContent(draft.helperContent);
            if (typeof draft.hangTitle === 'string') setHangTitle(draft.hangTitle);
            if (typeof draft.hangContent === 'string') setHangContent(draft.hangContent);
            if (typeof draft.eventTitle === 'string') setEventTitle(draft.eventTitle);
            if (typeof draft.eventDate === 'string') setEventDate(draft.eventDate);
            if (typeof draft.eventEndDate === 'string') setEventEndDate(draft.eventEndDate);
            if (typeof draft.eventAllDay === 'boolean') setEventAllDay(draft.eventAllDay);
            if (typeof draft.eventTime === 'string') setEventTime(draft.eventTime);
            if (typeof draft.eventLocation === 'string') setEventLocation(draft.eventLocation);
            if (draft.checkInAnswers && typeof draft.checkInAnswers === 'object') {
              setCheckInAnswers(draft.checkInAnswers as SurveyAnswers);
              setCheckInDirty(true);
            }
          }
        }
      } catch {
        // Bad or unreadable draft — start fresh.
      }
      if (!cancelled) setDraftRestored(true);
    };

    void restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [draftKey, draftRestored]);

  useEffect(() => {
    if (!draftKey || !draftRestored || finished) return;
    const timeout = setTimeout(() => {
      const draft: TuneupDraft = {
        savedAt: Date.now(),
        stepIndex,
        helperContent,
        hangTitle,
        hangContent,
        eventTitle,
        eventDate,
        eventEndDate,
        eventAllDay,
        eventTime,
        eventLocation,
        ...(checkInDirty ? { checkInAnswers } : {}),
      };
      void setStoredItemAsync(draftKey, JSON.stringify(draft));
    }, 400);
    return () => clearTimeout(timeout);
  }, [
    draftKey,
    draftRestored,
    finished,
    stepIndex,
    helperContent,
    hangTitle,
    hangContent,
    eventTitle,
    eventDate,
    eventEndDate,
    eventAllDay,
    eventTime,
    eventLocation,
    checkInAnswers,
    checkInDirty,
  ]);

  useEffect(() => {
    if (finished && draftKey) void removeStoredItemAsync(draftKey);
  }, [finished, draftKey]);

  const handlePostHangIdea = async () => {
    if (!hangContent.trim() || hangPosting) return;
    setHangPosting(true);
    setHangError(null);
    const result = await postToBoard(hangTitle, hangContent);
    setHangPosting(false);
    if (result.error) {
      setHangError(result.error);
      return;
    }
    if (result.boardName) setHangBoardName(result.boardName);
    setHangPosted((prev) => [...prev, deriveBoardPostTitle(hangTitle, hangContent)]);
    setHangTitle('');
    setHangContent('');
  };

  const handlePostHelperLog = async () => {
    const content = helperContent.trim();
    if (!content || helperPosting) return;
    if (!profile || !communityId) {
      setHelperError('Your profile is still loading. Please try again in a moment.');
      return;
    }

    setHelperPosting(true);
    setHelperError(null);

    let thread = helperThread ?? await findHelperThread();
    if (!thread) {
      setHelperPosting(false);
      setHelperError('Could not find the HIVE Helpers board. You can log it from the Boards tab instead.');
      return;
    }

    if (thread.postId) {
      // Same reply shape the Boards tab uses; reply_count / last_reply_at on the
      // thread are kept in sync by the update_reply_count DB trigger.
      const { error } = await (supabase as any).from('board_replies').insert({
        community_id: communityId,
        post_id: thread.postId,
        author_id: profile.id,
        content,
      });

      if (error) {
        setHelperPosting(false);
        setHelperError(`Failed to post: ${error.message}`);
        return;
      }

      // Non-blocking side-effects, mirroring the Boards reply composer.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.boardSearchIndex(communityId),
      });
      supabase.functions.invoke('notify-board-reply', {
        body: {
          post_id: thread.postId,
          reply_author_id: profile.id,
          reply_preview: content,
          community_id: communityId,
        },
      }).catch((err) => console.log('Board reply notification error (non-blocking):', err));
    } else {
      // No monthly thread yet — start one so this and later logs have a home.
      const { data, error } = await (supabase as any)
        .from('board_posts')
        .insert({
          community_id: communityId,
          category_id: thread.boardId,
          author_id: profile.id,
          title: `${monthName} HIVE Helpers`,
          content,
        })
        .select('id, title')
        .single();

      if (error) {
        setHelperPosting(false);
        setHelperError(`Failed to post: ${error.message}`);
        return;
      }

      thread = {
        ...thread,
        postId: data?.id ?? null,
        postTitle: data?.title ?? `${monthName} HIVE Helpers`,
      };
    }

    setHelperThread(thread);
    setHelperPosted((prev) => [...prev, deriveBoardPostTitle('', content)]);
    setHelperContent('');
    setHelperPosting(false);
  };

  // Same create path as hive.tsx's event modal: the create-event edge function.
  const handleCreateEvent = async () => {
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

    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      setEventError('Invalid date format. Please pick a date using the calendar.');
      return;
    }

    let eventEndDateIso: string | null = null;
    if (eventEndDate.trim()) {
      eventEndDateIso = parseAmericanDate(eventEndDate);
      if (!eventEndDateIso) {
        setEventError('Invalid end date. Please pick it using the calendar.');
        return;
      }
      if (eventEndDateIso < eventDateIso) {
        setEventError('The end date should be after the start date.');
        return;
      }
      if (eventEndDateIso === eventDateIso) eventEndDateIso = null;
    }

    const normalizedTime = eventAllDay ? { time: null, note: '' } : normalizeEventTimeInput(eventTime);
    if (!eventAllDay && eventTime.trim() && !normalizedTime.time) {
      setEventError('For time, use something like 7:30 PM.');
      return;
    }

    setSavingEvent(true);
    try {
      const newEvent: Record<string, string | null> = {
        title: eventTitle.trim(),
        event_date: eventDateIso,
        community_id: communityId,
      };
      if (eventEndDateIso) newEvent.end_date = eventEndDateIso;
      if (normalizedTime.time) newEvent.event_time = normalizedTime.time;
      if (normalizedTime.note) newEvent.description = `Time note: ${normalizedTime.note}`;
      if (eventLocation.trim()) newEvent.location = eventLocation.trim();

      const { error } = await supabase.functions.invoke('create-event', {
        body: newEvent,
      });
      if (error) throw error;

      setEventsAdded((prev) => [...prev, `${eventTitle.trim()} — ${eventDate}${eventEndDateIso ? ` → ${eventEndDate}` : ''}`]);
      setEventTitle('');
      setEventDate('');
      setEventEndDate('');
      setEventAllDay(false);
      setEventTime('');
      setEventLocation('');
    } catch (error: any) {
      setEventError(error?.message || 'Failed to create event. Please try again.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleOutOfTownPreset = () => {
    setEventTitle(`${getFirstName(profile?.name)} out of town`);
    // Trips are all-day stretches — surface the range fields, skip the time.
    setEventAllDay(true);
  };

  // Wish management — copied from profile.tsx's wiring.
  const handleArchiveWish = (wish: Wish) => {
    if (!profile || !communityId || !canArchiveWish(wish)) return;

    const archiveWish = async () => {
      const { error } = await supabase
        .from('wishes')
        .update({ status: 'replaced', is_active: false, replaced_at: new Date().toISOString() } as any)
        .eq('id', wish.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        Alert.alert('Error', 'Failed to archive wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await refreshWishes();
      setManagingWish(null);
    };

    Alert.alert(
      'Archive HD Wish',
      `Archive this HD wish from Wishes?\n\n"${wish.description}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', onPress: archiveWish },
      ]
    );
  };

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId) return;

    const deleteWish = async () => {
      const { error } = await deleteWishById({
        wishId: wish.id,
        communityId,
        ownerId: profile.id,
      });

      if (error) {
        Alert.alert('Error', 'Failed to delete wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await refreshWishes();
      setManagingWish(null);
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

  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await refreshWishes();
      setWishToGrant(null);
    }
    return result;
  };

  const openGrantModal = (wish: Wish) => {
    if (!profile) return;
    setWishToGrant({ ...wish, user: (wish.user ?? profile) as Profile });
  };

  const handleRefineWithClive = (roughWish: string) => {
    setAddWishModalVisible(false);
    router.push({
      pathname: '/(app)',
      params: { refineWish: roughWish },
    });
  };

  const handleWishSaved = async () => {
    await refreshWishes();
    setEditingWish(null);
    setAddWishModalVisible(false);
  };

  const goBack = () => {
    if (stepIndex === 0) {
      if (from === 'admin') router.replace('/admin');
      else if (from === 'meetings') router.replace('/meetings');
      else if (router.canGoBack()) router.back();
      else router.replace('/hive');
      return;
    }
    setStepIndex((index) => Math.max(0, index - 1));
  };

  const goNext = async () => {
    if (stepIndex >= STEPS.length - 1) {
      // Finishing: save any check-in answers the member touched this session.
      if (monthlyCheckInSurvey && checkInDirty && !checkInSaving) {
        setCheckInSaving(true);
        setCheckInError(null);
        const result = await submitResponse(monthlyCheckInSurvey.id, checkInAnswers);
        setCheckInSaving(false);
        if (result.error) {
          setCheckInError('Could not save your check-in answers. Please try again.');
          return;
        }
        setCheckInSubmitted(true);
        setCheckInDirty(false);
      }
      setFinished(true);
      return;
    }
    setStepIndex((index) => index + 1);
  };

  if (!profile) return null;

  const renderWishCard = (wish: Wish) => (
    <WishCombCard
      key={wish.id}
      wish={wish}
      ownerId={profile.id}
      ownerName={profile.name}
      ownerAvatarUrl={profile.avatar_url}
      compact
      onManage={(selectedWish) => setManagingWish(selectedWish as Wish)}
    />
  );

  const renderWishesStep = () => (
    <View style={{ gap: 12 }}>
      <StepHeader
        title="Your HD wishes 🌟"
        subtitle="Let's check in on your HDs — still true? Anything new? What's changed since last meeting? Did anyone help you? Mark it granted and give them credit 🌟"
      />
      {wishesLoading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color="#bd9348" />
        </View>
      ) : liveWishes.length === 0 ? (
        <View style={[cardStyle, { alignItems: 'center', paddingVertical: 28 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🌙</Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9a8060', textAlign: 'center' }}>
            No live HD wishes right now. What do you need help with?
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {liveWishes.map(renderWishCard)}
        </View>
      )}
      <Pressable
        onPress={() => setAddWishModalVisible(true)}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.72)',
          backgroundColor: pressed ? '#fbf0d7' : '#fffdf7',
          paddingHorizontal: 14,
          paddingVertical: 9,
        })}
      >
        <Ionicons name="add" size={16} color="#bd9348" />
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>New wish</Text>
      </Pressable>
    </View>
  );

  const renderHangsStep = () => (
    <View>
      <StepHeader
        title="Hang ideas 🎉"
        subtitle={`Any ideas for fun HIVE hangs? They post straight to ${hangBoardName ?? 'the HIVE Hangs board'} so planning can start.`}
      />
      <View style={[cardStyle, { gap: 10 }]}>
        <TextInput
          value={hangTitle}
          onChangeText={setHangTitle}
          placeholder="Title (optional)"
          placeholderTextColor="#b5ad9f"
          style={inputStyle}
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            value={hangContent}
            onChangeText={setHangContent}
            placeholder="Bowling night? Beach day? Potluck?..."
            placeholderTextColor="#b5ad9f"
            multiline
            blurOnSubmit={false}
            onKeyPress={submitOnEnter(handlePostHangIdea)}
            style={[inputStyle, { flex: 1, minHeight: 90, textAlignVertical: 'top' }]}
          />
          <VoiceMicButton
            size={20}
            style={{ marginBottom: 10 }}
            onTranscript={(text) => {
              const trimmed = text.trim();
              if (!trimmed) return;
              setHangContent((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${trimmed}` : trimmed));
            }}
          />
        </View>
        {hangError ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{hangError}</Text>
        ) : null}
        <Pressable
          onPress={handlePostHangIdea}
          disabled={hangPosting || !hangContent.trim()}
          style={({ pressed }) => ({
            backgroundColor: hangContent.trim() ? '#bd9348' : '#e5e7eb',
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed || hangPosting ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: hangContent.trim() ? 'white' : '#9ca3af' }}>
            {hangPosting ? 'Posting...' : 'Post hang idea'}
          </Text>
        </Pressable>
      </View>
      <PostedConfirmation lines={hangPosted} boardName={hangBoardName} />
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        Post as many as you like — or tap Next to skip.
      </Text>
    </View>
  );

  const renderCalendarStep = () => (
    <View>
      <StepHeader
        title="Calendar 🗓️"
        subtitle="Upcoming events to add? Out of town at all? Anything you add shows up in Upcoming Events for everyone."
      />
      <View style={[cardStyle, { gap: 10 }]}>
        <Pressable
          onPress={handleOutOfTownPreset}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.72)',
            backgroundColor: pressed ? '#fbf0d7' : '#fdf3dc',
            paddingHorizontal: 12,
            paddingVertical: 7,
          })}
        >
          <Text style={{ fontSize: 13 }}>✈️</Text>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>I'm out of town</Text>
        </Pressable>
        <TextInput
          value={eventTitle}
          onChangeText={setEventTitle}
          placeholder="Event title"
          placeholderTextColor="#b5ad9f"
          style={inputStyle}
        />
        <EventDatePicker value={eventDate} onChange={setEventDate} />
        <EventDatePicker
          value={eventEndDate}
          onChange={setEventEndDate}
          label="End date (optional — for multi-day stretches)"
          placeholder="Same day"
          clearable
        />
        <Pressable
          onPress={() => setEventAllDay((prev) => !prev)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: eventAllDay ? '#bd9348' : '#d1d5db',
              backgroundColor: eventAllDay ? '#bd9348' : 'white',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {eventAllDay ? <Text style={{ color: 'white', fontSize: 12 }}>✓</Text> : null}
          </View>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4a4a4a' }}>All day (no set time)</Text>
        </Pressable>
        {!eventAllDay && (
          <TextInput
            value={eventTime}
            onChangeText={setEventTime}
            placeholder="Time (optional) — 7:30 PM"
            placeholderTextColor="#b5ad9f"
            style={inputStyle}
          />
        )}
        <TextInput
          value={eventLocation}
          onChangeText={setEventLocation}
          placeholder="Location (optional)"
          placeholderTextColor="#b5ad9f"
          style={inputStyle}
        />
        {eventError ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{eventError}</Text>
        ) : null}
        <Pressable
          onPress={handleCreateEvent}
          disabled={savingEvent}
          style={({ pressed }) => ({
            backgroundColor: eventTitle.trim() && eventDate ? '#bd9348' : '#e5e7eb',
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed || savingEvent ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: eventTitle.trim() && eventDate ? 'white' : '#9ca3af' }}>
            {savingEvent ? 'Adding...' : 'Add to HIVE calendar'}
          </Text>
        </Pressable>
      </View>
      {eventsAdded.length > 0 ? (
        <View
          style={{
            backgroundColor: '#ecfdf3',
            borderWidth: 1,
            borderColor: '#86efac',
            borderRadius: 14,
            padding: 12,
            marginTop: 12,
            gap: 4,
          }}
        >
          {eventsAdded.map((line, index) => (
            <Text key={`${line}-${index}`} style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#166534' }}>
              ✓ Added: {line}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        Add as many as you like — or tap Next to skip.
      </Text>
    </View>
  );

  const renderHelpersStep = () => (
    <View>
      <StepHeader
        title="HIVE helps 🐝"
        subtitle="Little kindnesses out in the world since last meeting — no act too tiny! Picked up a candy wrapper on a walk? Gave your change to someone? Complimented a stranger? Donated a blanket to the dog shelter? Log it — it lands in this month's HIVE Helpers thread and gets its moment on the Progress slide 🌟 (totally optional, always). (Helped a HIVE member? That belongs on their wish — mark it granted!)"
      />
      {helperThread?.postTitle ? (
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348', marginTop: -6, marginBottom: 12 }}>
          This month's thread: "{helperThread.postTitle}"
        </Text>
      ) : null}
      <View style={[cardStyle, { gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            value={helperContent}
            onChangeText={setHelperContent}
            placeholder="What tiny (or huge) kindness did you do?"
            placeholderTextColor="#b5ad9f"
            multiline
            blurOnSubmit={false}
            onKeyPress={submitOnEnter(handlePostHelperLog)}
            style={[inputStyle, { flex: 1, minHeight: 90, textAlignVertical: 'top' }]}
          />
          <VoiceMicButton
            size={20}
            style={{ marginBottom: 10 }}
            onTranscript={(text) => {
              const trimmed = text.trim();
              if (!trimmed) return;
              setHelperContent((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${trimmed}` : trimmed));
            }}
          />
        </View>
        {helperError ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{helperError}</Text>
        ) : null}
        <Pressable
          onPress={handlePostHelperLog}
          disabled={helperPosting || !helperContent.trim()}
          style={({ pressed }) => ({
            backgroundColor: helperContent.trim() ? '#bd9348' : '#e5e7eb',
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed || helperPosting ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: helperContent.trim() ? 'white' : '#9ca3af' }}>
            {helperPosting ? 'Logging...' : 'Log kindness'}
          </Text>
        </Pressable>
      </View>
      <PostedConfirmation lines={helperPosted} boardName={helperThread?.postTitle ?? helperThread?.boardName ?? null} />
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        Nothing to log? No worries — tap Next.
      </Text>
    </View>
  );

  // The check-in questions live right here in the flow — no separate survey
  // modal at the end. Answers save when the member taps Finish.
  const checkInQuestions = (monthlyCheckInSurvey?.questions ?? [])
    .filter((question) => question.id !== 'q_carry_forward');

  const renderCheckInStep = () => (
    <View>
      <StepHeader
        title="Check-in 📝"
        subtitle="Last stop — a few quick questions so HIVE and Clive arrive prepared. Your answers save when you tap Finish, and you can come back and change them any time this month."
      />
      {surveysLoading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color="#bd9348" />
        </View>
      ) : !monthlyCheckInSurvey ? (
        <View style={[cardStyle, { alignItems: 'center', paddingVertical: 28 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🌙</Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9a8060', textAlign: 'center' }}>
            No monthly check-in is open right now. Tap Finish to wrap up your tune-up.
          </Text>
        </View>
      ) : (
        <View style={[cardStyle, { gap: 4 }]}>
          {checkInAlreadyDone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={16} color="#166534" />
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#166534' }}>
                Submitted for {monthName} — edits here overwrite your earlier answers.
              </Text>
            </View>
          ) : null}
          {checkInQuestions.map((question, index) => (
            <SurveyQuestionField
              key={question.id}
              question={question}
              index={index}
              value={checkInAnswers[question.id]}
              onChange={(value) => setCheckInAnswer(question.id, value)}
            />
          ))}
          {checkInError ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{checkInError}</Text>
          ) : null}
        </View>
      )}
    </View>
  );

  const renderStep = () => {
    switch (STEPS[stepIndex].key) {
      case 'wishes':
        return renderWishesStep();
      case 'hangs':
        return renderHangsStep();
      case 'calendar':
        return renderCalendarStep();
      case 'helpers':
        return renderHelpersStep();
      case 'checkin':
        return renderCheckInStep();
      default:
        return null;
    }
  };

  if (finished) {
    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Image
            source={hiveBee}
            style={{ width: 84, height: 84, marginBottom: 16 }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 24,
              color: '#2d2d2d',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            You're all tuned up for the {monthName} meeting!
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 22, color: '#7d715f', textAlign: 'center', marginBottom: 32 }}>
            Wishes refreshed, ideas posted, calendar updated — HIVE thanks you.
          </Text>
          <Pressable
            onPress={() => router.replace('/hive')}
            style={({ pressed }) => ({
              backgroundColor: '#bd9348',
              borderRadius: 14,
              paddingHorizontal: 32,
              paddingVertical: 14,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>Back to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={stepIndex === 0 ? 'Close tune-up' : 'Previous step'}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.55)',
          })}
        >
          <Ionicons name="chevron-back" size={20} color="#8a6b30" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image
              source={hiveBee}
              style={{ width: 26, height: 26 }}
              contentFit="contain"
            />
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 20, color: '#2d2d2d' }}>
              {monthName} Tune-up
            </Text>
          </View>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 2 }}>
            Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}
          </Text>
        </View>
      </View>

      {/* Progress dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
        {STEPS.map((step, index) => (
          <View
            key={step.key}
            style={{
              width: index === stepIndex ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: index <= stepIndex ? '#bd9348' : 'rgba(189,147,72,0.24)',
            }}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep()}
      </ScrollView>

      {/* Footer: Back / Next — Next always available so every step is skippable */}
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: 'rgba(222,193,129,0.35)',
          backgroundColor: '#fffdf5',
        }}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.55)',
            backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30' }}>
            {stepIndex === 0 ? 'Close' : 'Back'}
          </Text>
        </Pressable>
        <Pressable
          onPress={goNext}
          style={({ pressed }) => ({
            flex: 2,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            backgroundColor: '#bd9348',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>
            {stepIndex === STEPS.length - 1
              ? checkInSaving ? 'Saving...' : checkInDirty ? 'Save & finish ✓' : 'Finish ✓'
              : 'Looks good →'}
          </Text>
        </Pressable>
      </View>

      {/* Wish manage / edit / add / grant — same wiring as profile.tsx */}
      <WishManageModal
        visible={!!managingWish}
        wish={managingWish}
        onClose={() => setManagingWish(null)}
        canGrant={!!managingWish && canGrantWish(managingWish)}
        canEdit={!!managingWish && canEditWish(managingWish)}
        canArchive={!!managingWish && canArchiveWish(managingWish)}
        canDelete={!!managingWish}
        canRefine={!!managingWish && canRefineWish(managingWish)}
        onGrant={openGrantModal}
        onEdit={(wish) => setEditingWish(wish)}
        onArchive={handleArchiveWish}
        onDelete={handleDeleteWish}
        onRefine={(wish) => handleRefineWithClive(wish.description)}
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

      <AddWishModal
        visible={addWishModalVisible}
        onClose={() => setAddWishModalVisible(false)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleWishSaved}
        onRefineWithClive={handleRefineWithClive}
      />
      <AddWishModal
        visible={!!editingWish}
        onClose={() => setEditingWish(null)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleWishSaved}
        existingWish={editingWish}
        wishOwnerUserId={editingWish?.user_id}
        wishOwnerName={editingWish?.user?.name}
      />

    </SafeAreaView>
  );
}

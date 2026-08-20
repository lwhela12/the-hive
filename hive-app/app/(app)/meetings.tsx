import { useEffect, useState, useCallback } from 'react';
import { View, Text, RefreshControl, Pressable, Linking, useWindowDimensions, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useDeepTrail } from '../../lib/hooks/usePathTrail';
import { pickMultipleImages, takePhoto, getImageExtension, getContentType } from '../../lib/imagePicker';
import { MeetingSummary } from '../../components/meetings/MeetingSummary';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal';
import { AppHeader } from '../../components/navigation';
import { FadeIn } from '../../components/ui/FadeIn';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { UpcomingMeetingsSkeleton, PastRecordingsSkeleton } from '../../components/meetings/MeetingsSkeleton';
import { formatDateLong, formatTime, parseAmericanDate } from '../../lib/dateUtils';
import { normalizeHiveBrandText } from '../../lib/hiveBrand';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { ComposerBar } from '../../components/ui/ComposerBar';
import { FIELD_LOOK } from '../../components/ui/Input';
import { confirmAction, showAlert } from '../../lib/showAlert';
import { CHECK_INS_COMING_SOON_MESSAGE, hasTailoredCheckIns, hasMeetingDeck, hasEndOfMonthCheckIn, getSeasonCheckInKind, isSurveyOnHomeToday, SEASON_CHECK_IN_EMOJI } from '../../lib/checkIns';
import { useSurveys, isMonthlyCheckInSurvey } from '../../lib/hooks/useSurveys';
import { SurveyModal } from '../../components/surveys/SurveyModal';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import type { Meeting, Event } from '../../types';

/**
 * The look worn by the two boxes here you would never talk into — a clock time
 * and a link. Everything that takes WORDS is a `ComposerBar`, mic and all; these
 * two keep a plain field but wear the composer's white fill, gold hairline and
 * placeholder ink so the form reads as one set of controls.
 */
const FIELD_BORDER = FIELD_LOOK.border;
const PLACEHOLDER_INK = FIELD_LOOK.placeholder;
const FIELD_LABEL_CLASS = 'text-charcoal mb-2';
interface MeetingSummaryPreview {
  title?: string;
  source?: string;
  import_status?: 'pending' | 'preview' | 'applied' | 'live';
  summary?: string;
  decisions?: string[];
  board_suggestions?: unknown[];
}

interface NotesImportFile {
  fileName: string;
  fileMimeType: string | null;
  fileBase64: string;
}

// Voice memos go straight to the meeting-recordings bucket (way too big to
// base64 into the edge function) — the form only carries their storage paths.
interface NotesImportAudioFile {
  fileName: string;
  storagePath: string;
}

type NotesImportForm = {
  title: string;
  date: string;
  notes: string;
  linkedEventId: string | null;
  files: NotesImportFile[];
  audioFiles: NotesImportAudioFile[];
};

const AUDIO_FILE_EXTENSIONS = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'flac', 'caf', 'aiff', 'amr'];

const isAudioFileName = (fileName?: string | null, mimeType?: string | null) => {
  if (mimeType?.startsWith('audio/')) return true;
  const extension = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_FILE_EXTENSIONS.includes(extension);
};

type EventEditForm = {
  title: string;
  description: string;
  location: string;
  event_date: string;
  event_time: string;
};

type MeetingFormDraft<T> = {
  active: boolean;
  form: T;
  updatedAt: number;
};

const DEFAULT_HIVE_DECK_VIEW_URL = 'https://www.canva.com/d/CQkVqOMhwuO06qe';
const MEETING_FORM_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What one meeting is called in the path along the bottom.
 *
 * The month, because that is how the HIVE talks about its meetings — "June",
 * not "Meeting on June 12, 2026". `formatDateLong` is reused rather than a
 * fresh `new Date()` so a date-only string keeps the day it was saved with;
 * parsing "2026-06-01" as UTC in a US timezone hands back May.
 */
const meetingTrailLabel = (meeting: Meeting) => {
  const long = formatDateLong(meeting.date);
  return long.split(' ')[0] || long;
};

const getIsMobileWeb = () => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
};

const openExternalUrl = async (url: string, errorMessage: string) => {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    showAlert('Error', errorMessage);
    return;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (getIsMobileWeb()) {
        window.location.assign(trimmedUrl);
        return;
      }

      const openedWindow = window.open(trimmedUrl, '_blank');
      if (!openedWindow) {
        window.location.assign(trimmedUrl);
      } else {
        openedWindow.opener = null;
      }
    } catch {
      window.location.assign(trimmedUrl);
    }
    return;
  }

  try {
    await Linking.openURL(trimmedUrl);
  } catch {
    showAlert('Error', errorMessage);
  }
};

const toAmericanDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');
  return month && day && year ? `${month}-${day}-${year}` : isoDate;
};

const getTodayIsoDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
};


const getImportTitle = (event?: Event | null) => normalizeHiveBrandText(event?.title).trim() || 'HIVE Meeting';

const parseMeetingSummaryPreview = (summary?: string): MeetingSummaryPreview => {
  if (!summary) return {};
  try {
    const parsed = JSON.parse(summary);
    return typeof parsed === 'object' && parsed !== null ? parsed : { summary: String(parsed) };
  } catch {
    return { summary };
  }
};

export default function MeetingsScreen() {
  const router = useRouter();
  const { hive: linkedHiveId, meeting: linkedMeetingId } = useLocalSearchParams<{ hive?: string; meeting?: string }>();
  const { profile, communityId, session, communityRole, community, refreshProfile, memberships, switchCommunity, wholeHive } = useAuth();
  const requestedHiveId = Array.isArray(linkedHiveId) ? linkedHiveId[0] : linkedHiveId;
  const requestedMeetingId = Array.isArray(linkedMeetingId) ? linkedMeetingId[0] : linkedMeetingId;
  const { width } = useWindowDimensions();
  const useCompactActions = width < 640;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  // Quarter/year check-ins, added to this row alongside the monthly pair
  // (Nat, 2026-08-13: the Q3 survey was great, "should we also add them
  // here, to the meeting screen?"). They keep to the same narrow window
  // Home uses — three days before the quarter/year ends — so this row never
  // shows a check-in nobody can act on yet.
  const { availableSurveys, myResponses, submitResponse: submitSeasonSurvey } = useSurveys(communityId ?? undefined, profile?.id);
  const [activeSeasonSurvey, setActiveSeasonSurvey] = useState<any | null>(null);
  /**
   * Every check-in this HIVE has open today — the same rule Home uses, so the
   * two screens can never disagree about whether there is one.
   *
   * It used to ask only for the season check-ins (quarterly, end-of-year), and
   * Production HIVE is what proved that wrong: it has had both its own
   * check-ins since 2026-08-14 — "Before our first meeting", closing the
   * afternoon of the 18th, and "Where the show got to this month" — and this
   * screen still showed it "coming soon" while the email in its members'
   * inboxes said the check-in was open. Nat, 2026-08-15: *"we made those
   * already, so that needs to be fixed."*
   */
  // The monthly check-in is INSIDE the Monthly Tune-up (its check-in step
  // submits the same survey), so on a HIVE with tailored check-ins it does not
  // get a chip of its own — two doors to one set of answers read as two chores
  // (Nat, 2026-08-19: "that seems redundant, right?"). Season check-ins and
  // anything else keep theirs.
  const openCheckIns = availableSurveys.filter((s) =>
    isSurveyOnHomeToday(s, new Date()) && !(hasTailoredCheckIns(community) && isMonthlyCheckInSurvey(s)));
  // The 2026-08-07 decision gated the check-ins in Admin and on the direct
  // tune-up route, but this screen kept offering OG's tune-up pills and the
  // Meeting Helper deck inside Tech and Production as if they were theirs
  // (Nat, 2026-08-11: "I dont want these blindly brought over from OG hive").
  // Same rule, same shared string, applied to every door on this screen.
  const tailoredCheckIns = hasTailoredCheckIns(community);
  /**
   * Whether the Meeting Helper tile opens.
   *
   * This used to be `tailoredCheckIns`, which is why Production HIVE's deck
   * shipped on 2026-08-14 and the button in front of it still read "coming
   * soon" — the screen's own gate had been opened and this one, a floor above
   * it, had not. Two guards on one feature, and fixing the inner one changed
   * nothing a member could see.
   *
   * They are genuinely different questions: the deck is how a meeting is RUN,
   * the check-ins are what members fill in BEFORE one. Production has the
   * first and not yet the second.
   */
  const meetingDeck = hasMeetingDeck(community);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  // Slide deck URL — pulled from community record, editable by admin
  const [slideDeckUrl, setSlideDeckUrl] = useState(community?.slide_deck_url ?? '');
  const [showDeckActions, setShowDeckActions] = useState(false);
  const [showDeckEdit, setShowDeckEdit] = useState(false);
  const [deckUrlDraft, setDeckUrlDraft] = useState('');
  const [savingDeckUrl, setSavingDeckUrl] = useState(false);
  const effectiveSlideDeckUrl = slideDeckUrl.trim() || DEFAULT_HIVE_DECK_VIEW_URL;

  useEffect(() => {
    if (community?.slide_deck_url !== undefined) setSlideDeckUrl(community.slide_deck_url ?? '');
  }, [community?.slide_deck_url]);

  const fetchLatestSlideDeckUrl = useCallback(async () => {
    if (!communityId) return '';
    const { data, error } = (await supabase
      .from('communities')
      .select('slide_deck_url')
      .eq('id', communityId)
      .single()) as { data: { slide_deck_url: string | null } | null; error: { message?: string } | null };

    if (error) {
      console.error('Failed to fetch slide deck URL:', error);
      return '';
    }

    const latestUrl = data?.slide_deck_url ?? '';
    setSlideDeckUrl(latestUrl);
    return latestUrl;
  }, [communityId]);

  useEffect(() => {
    void fetchLatestSlideDeckUrl();
  }, [fetchLatestSlideDeckUrl]);

  const handleSaveDeckUrl = async () => {
    if (!communityId) return;
    const nextUrl = deckUrlDraft.trim();
    setSavingDeckUrl(true);
    const { error } = await (supabase.from('communities') as any).update({ slide_deck_url: nextUrl || null }).eq('id', communityId);
    setSavingDeckUrl(false);
    if (!error) {
      setSlideDeckUrl(nextUrl);
      await refreshProfile();
      await fetchLatestSlideDeckUrl();
      setShowDeckEdit(false);
    } else {
      showAlert('Error', 'Could not save the slide deck link. Please try again.');
      console.error('Slide deck URL save failed:', error);
    }
  };

  const handleSlideDeckPress = () => {
    if (isAdmin) {
      setShowDeckActions(true);
      void fetchLatestSlideDeckUrl();
      return;
    }

    void openExternalUrl(effectiveSlideDeckUrl, 'Could not open the slide deck');
    void fetchLatestSlideDeckUrl();
  };

  const handleOpenSlideDeck = (url: string) => {
    void openExternalUrl(url, 'Could not open the slide deck');
  };
  const [upcomingMeetings, setUpcomingMeetings] = useState<Event[]>([]);
  const [meetingEvents, setMeetingEvents] = useState<Event[]>([]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showNotesImport, setShowNotesImport] = useState(false);
  const [showMeetingPicker, setShowMeetingPicker] = useState(false);
  const [importingNotes, setImportingNotes] = useState(false);
  const [notesImportForm, setNotesImportForm] = useState<NotesImportForm>({
    title: 'HIVE Meeting',
    date: toAmericanDate(getTodayIsoDate()),
    notes: '',
    linkedEventId: null as string | null,
    files: [] as NotesImportFile[],
    audioFiles: [] as NotesImportAudioFile[],
  });
  const [uploadingAudioCount, setUploadingAudioCount] = useState(0);
  const [notesDropActive, setNotesDropActive] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // Email links name both rooms: first enter the correct HIVE, then open the
  // exact sealed summary. Holding until the switch finishes avoids briefly
  // showing the same id against whichever HIVE the app remembered last.
  useEffect(() => {
    if (!requestedHiveId) return;
    if (!memberships.some((membership) => membership.community_id === requestedHiveId)) return;
    if (!wholeHive && communityId === requestedHiveId) return;
    void switchCommunity(requestedHiveId);
  }, [requestedHiveId, memberships, wholeHive, communityId, switchCommunity]);

  useEffect(() => {
    if (!requestedMeetingId || !requestedHiveId || communityId !== requestedHiveId) return;
    const match = meetings.find((meeting) => meeting.id === requestedMeetingId);
    if (match) setSelectedMeeting(match);
  }, [requestedMeetingId, requestedHiveId, communityId, meetings]);

  /**
   * Where you are once you open a summary.
   *
   * A summary is not its own address — it swaps the whole page for itself while
   * the route still says `/meetings`, so the strip along the bottom had no way
   * to know anything had happened and kept saying `OG HIVE › Meetings` while
   * Nat sat inside June's write-up (2026-08-06). She expects
   * `OG HIVE › Meetings › Meeting Summaries › June`, so the two steps the route
   * cannot see are handed over from here.
   *
   * "Meeting Summaries" is the heading on the list below, word for word, and
   * pressing it puts the list back — the same thing the ← at the top of the
   * summary does.
   */
  useDeepTrail(
    selectedMeeting
      ? [
          { label: 'Meeting Summaries', onPress: () => setSelectedMeeting(null) },
          { label: meetingTrailLabel(selectedMeeting) },
        ]
      : [],
  );

  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editForm, setEditForm] = useState<EventEditForm>({
    title: '',
    description: '',
    location: '',
    event_date: '',
    event_time: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingMeetLink, setAddingMeetLink] = useState(false);
  const notesImportDraftKey = communityId ? `the-hive:meeting-notes-import-draft:${communityId}` : null;
  const activeMeetingEditKey = communityId ? `the-hive:meeting-edit-active:${communityId}` : null;
  const eventEditDraftKey = communityId && editingEvent
    ? `the-hive:meeting-edit-draft:${communityId}:${editingEvent.id}`
    : null;

  function readMeetingFormDraft<T>(key: string | null): MeetingFormDraft<T> | null {
    if (!key) return null;

    const rawDraft = getStoredItem(key);
    if (!rawDraft) return null;

    try {
      const draft = JSON.parse(rawDraft) as MeetingFormDraft<T>;
      if (!draft?.form || Date.now() - Number(draft.updatedAt ?? 0) > MEETING_FORM_DRAFT_TTL_MS) {
        removeStoredItem(key);
        return null;
      }
      return draft;
    } catch {
      removeStoredItem(key);
      return null;
    }
  }

  const getDefaultNotesImportForm = (event?: Event | null): NotesImportForm => {
    const date = event?.event_date ?? getTodayIsoDate();
    return {
      title: getImportTitle(event),
      date: toAmericanDate(date),
      notes: '',
      linkedEventId: event?.id ?? null,
      files: [],
      audioFiles: [],
    };
  };

  const getEventEditDraftKey = (eventId: string) => (
    communityId ? `the-hive:meeting-edit-draft:${communityId}:${eventId}` : null
  );

  const fetchMeetings = useCallback(async () => {
    if (!communityId) return;

    // Fetch imported meeting summaries and historical recordings.
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('community_id', communityId)
      .order('date', { ascending: false })
      .limit(20);

    if (!error && data) {
      setMeetings(data);
    }

    await fetchLatestSlideDeckUrl();

    // Fetch upcoming scheduled meetings - use local date to avoid timezone issues
    // Exclude completed meetings
    const now = new Date();
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .gte('event_date', today)
      .or('status.is.null,status.eq.scheduled')
      .order('event_date', { ascending: true })
      .limit(10);

    if (!eventsError && events) {
      setUpcomingMeetings(events);
    }

    const { data: allMeetingEvents, error: allMeetingEventsError } = await supabase
      .from('events')
      .select('*')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .order('event_date', { ascending: false })
      .order('event_time', { ascending: false })
      .limit(50);

    if (!allMeetingEventsError && allMeetingEvents) {
      setMeetingEvents(allMeetingEvents);
    }

    setInitialLoading(false);
  }, [communityId, fetchLatestSlideDeckUrl]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    const savedDraft = readMeetingFormDraft<NotesImportForm>(notesImportDraftKey);
    if (!savedDraft) return;

    // Older drafts predate audioFiles — normalize so .map/.length never crash.
    setNotesImportForm({ ...savedDraft.form, audioFiles: savedDraft.form.audioFiles ?? [] });
    if (savedDraft.active) {
      setShowNotesImport(true);
    }
  }, [notesImportDraftKey]);

  useEffect(() => {
    if (!notesImportDraftKey) return;

    const hasDraftContent =
      notesImportForm.notes.trim().length > 0 ||
      notesImportForm.files.length > 0 ||
      notesImportForm.audioFiles.length > 0 ||
      notesImportForm.title.trim() !== 'HIVE Meeting';

    if (!showNotesImport && !hasDraftContent) {
      removeStoredItem(notesImportDraftKey);
      return;
    }

    setStoredItem(notesImportDraftKey, JSON.stringify({
      active: showNotesImport,
      form: notesImportForm,
      updatedAt: Date.now(),
    } satisfies MeetingFormDraft<NotesImportForm>));
  }, [notesImportDraftKey, notesImportForm, showNotesImport]);

  useEffect(() => {
    if (!activeMeetingEditKey || editingEvent || meetingEvents.length === 0) return;

    const activeEventId = getStoredItem(activeMeetingEditKey);
    const activeEvent = activeEventId ? meetingEvents.find((event) => event.id === activeEventId) : null;
    if (activeEvent) {
      handleEditEvent(activeEvent);
    } else if (activeEventId) {
      removeStoredItem(activeMeetingEditKey);
    }
  }, [activeMeetingEditKey, editingEvent, meetingEvents]);

  useEffect(() => {
    if (!eventEditDraftKey || !editingEvent) return;

    setStoredItem(eventEditDraftKey, JSON.stringify({
      active: true,
      form: editForm,
      updatedAt: Date.now(),
    } satisfies MeetingFormDraft<EventEditForm>));
    if (activeMeetingEditKey) setStoredItem(activeMeetingEditKey, editingEvent.id);
  }, [activeMeetingEditKey, editForm, editingEvent, eventEditDraftKey]);

  // Poll for updates when there are meetings being processed
  // This is more reliable than Realtime for status updates
  useEffect(() => {
    if (!communityId) return;

    // Check if any meetings are still processing
    const hasProcessingMeetings = meetings.some(
      (m) => m.processing_status === 'pending' ||
             m.processing_status === 'transcribing' ||
             m.processing_status === 'summarizing'
    );

    if (!hasProcessingMeetings) return;

    // Poll every 5 seconds while there are processing meetings
    const pollInterval = setInterval(() => {
      fetchMeetings();
    }, 5000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [communityId, meetings, fetchMeetings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMeetings();
    setRefreshing(false);
  };

  const handleScheduleMeeting = async (data: {
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    attendeeIds: string[];
    timezone: string;
    location?: string;
  }) => {
    if (!communityId || !session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await supabase.functions.invoke('schedule-meeting', {
      body: {
        title: data.title,
        description: data.description,
        date: data.date,
        time: data.time,
        duration: data.duration,
        communityId,
        attendeeIds: data.attendeeIds,
        timezone: data.timezone,
        location: data.location,
      },
    });

    if (response.error) {
      // Extract actual error from edge function response
      let errorMsg = 'Failed to schedule meeting';
      try {
        const ctx = (response.error as any).context;
        if (ctx instanceof Response) {
          const body = await ctx.json();
          errorMsg = body?.error || errorMsg;
        }
      } catch {
        // Fall back to generic message
      }
      if (errorMsg === 'Failed to schedule meeting') {
        errorMsg = response.error.message || errorMsg;
      }
      throw new Error(errorMsg);
    }

    showAlert(
      'Meeting Scheduled',
      'Everyone in this HIVE can see it, and the calendar invite points at the Meeting Helper.'
    );

    await fetchMeetings();
  };

  const handleDeleteMeeting = (eventId: string, title: string) => {
    const displayTitle = normalizeHiveBrandText(title);
    const doDelete = async () => {
      // Call edge function to delete from Google Calendar and database
      const { error } = await supabase.functions.invoke('delete-meeting', {
        body: { eventId },
      });

      if (error) {
        showAlert('Error', `Failed to delete meeting: ${error.message}`);
        console.error('Delete error:', error);
      } else {
        await fetchMeetings();
      }
    };

    // One shared ask on both platforms. This used to hand-roll the web branch
    // and then fall through to `Alert.alert`, which says nothing at all in a
    // browser — and the browser is where nearly everyone is.
    confirmAction({
      title: 'Delete meeting',
      message: `Are you sure you want to delete "${displayTitle}"?`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: doDelete,
    });
  };

  const handleMarkComplete = async (meetingId: string) => {
    const doMark = async () => {
      const { error } = await supabase
        .from('meetings')
        .update({ processing_status: 'complete' })
        .eq('id', meetingId);

      if (error) {
        showAlert('Error', 'Failed to update meeting status');
      } else {
        await fetchMeetings();
      }
    };

    confirmAction({
      title: 'Mark complete',
      message: 'Mark this meeting as complete? You can add notes manually.',
      confirmLabel: 'Mark Complete',
      onConfirm: doMark,
    });
  };

  const handleEditEvent = (event: Event) => {
    const savedDraft = readMeetingFormDraft<EventEditForm>(getEventEditDraftKey(event.id));
    setEditForm(savedDraft?.form ?? {
      title: normalizeHiveBrandText(event.title),
      description: event.description || '',
      location: event.location || '',
      event_date: (() => {
        const [y, m, d] = event.event_date.split('-');
        return `${m}-${d}-${y}`;
      })(),
      event_time: event.event_time || '',
    });
    setEditingEvent(event);
    if (activeMeetingEditKey) setStoredItem(activeMeetingEditKey, event.id);
  };

  const closeEventEdit = () => {
    if (eventEditDraftKey && editingEvent) {
      setStoredItem(eventEditDraftKey, JSON.stringify({
        active: false,
        form: editForm,
        updatedAt: Date.now(),
      } satisfies MeetingFormDraft<EventEditForm>));
    }
    if (activeMeetingEditKey) removeStoredItem(activeMeetingEditKey);
    setEditingEvent(null);
  };

  const handleSaveEdit = async () => {
    if (!editingEvent) return;

    setSavingEdit(true);
    try {
      // Use edge function to update both database and Google Calendar
      const { error } = await supabase.functions.invoke('update-meeting', {
        body: {
          eventId: editingEvent.id,
          title: normalizeHiveBrandText(editForm.title).trim(),
          description: editForm.description || null,
          location: editForm.location || null,
          date: parseAmericanDate(editForm.event_date) ?? editForm.event_date,
          time: editForm.event_time || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      if (error) throw error;

      if (eventEditDraftKey) removeStoredItem(eventEditDraftKey);
      if (activeMeetingEditKey) removeStoredItem(activeMeetingEditKey);
      setEditingEvent(null);
      await fetchMeetings();
      showAlert('Success', 'Meeting updated');
    } catch (error) {
      console.error('Error updating event:', error);
      showAlert('Error', 'Failed to update meeting');
    } finally {
      setSavingEdit(false);
    }
  };

  const openNotesImport = (event?: Event | null) => {
    const savedDraft = readMeetingFormDraft<NotesImportForm>(notesImportDraftKey);
    const matchesRequestedMeeting =
      savedDraft?.form.linkedEventId === (event?.id ?? null)
      || (!event && !!savedDraft?.form);
    setNotesImportForm(matchesRequestedMeeting ? savedDraft.form : getDefaultNotesImportForm(event));
    setShowMeetingPicker(false);
    setShowNotesImport(true);
  };

  const closeNotesImport = () => {
    if (notesImportDraftKey) {
      setStoredItem(notesImportDraftKey, JSON.stringify({
        active: false,
        form: notesImportForm,
        updatedAt: Date.now(),
      } satisfies MeetingFormDraft<NotesImportForm>));
    }
    setShowNotesImport(false);
  };

  const selectNotesImportMeeting = (event: Event | null) => {
    if (event) {
      setNotesImportForm((form) => ({
        ...form,
        title: getImportTitle(event),
        date: toAmericanDate(event.event_date),
        linkedEventId: event.id,
      }));
    } else {
      setNotesImportForm((form) => ({
        ...form,
        linkedEventId: null,
      }));
    }

    setShowMeetingPicker(false);
  };

  const readAssetAsBase64 = async (asset: DocumentPicker.DocumentPickerAsset) => {
    if (asset.base64) {
      return asset.base64.includes(',') ? asset.base64.split(',').pop() ?? asset.base64 : asset.base64;
    }

    if (Platform.OS === 'web' && asset.file) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          resolve(result.includes(',') ? result.split(',').pop() ?? result : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
        reader.readAsDataURL(asset.file!);
      });
    }

    return await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  const readPhotoAsBase64 = async (photo: { uri: string; base64?: string }) => {
    if (photo.base64) {
      return photo.base64.includes(',') ? photo.base64.split(',').pop() ?? photo.base64 : photo.base64;
    }

    if (Platform.OS === 'web') {
      if (photo.uri.startsWith('data:')) {
        return photo.uri.split(',').pop() ?? photo.uri;
      }

      const response = await fetch(photo.uri);
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          resolve(result.includes(',') ? result.split(',').pop() ?? result : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected photo.'));
        reader.readAsDataURL(blob);
      });
    }

    return await FileSystem.readAsStringAsync(photo.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  // Voice memos upload straight to storage; the import request only carries
  // their paths (an hour-long .m4a is far past the edge function's base64 cap).
  const uploadAudioToStorage = async (input: {
    fileName: string;
    mimeType: string | null;
    webFile?: File | null;
    uri?: string | null;
  }): Promise<NotesImportAudioFile> => {
    if (!communityId) throw new Error('No active community selected.');
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'voice-memo.m4a';
    const storagePath = `${communityId}/imports/${Date.now()}-${safeName}`;
    const contentType = input.mimeType || 'audio/mp4';

    if (Platform.OS === 'web' && input.webFile) {
      const { error } = await supabase.storage
        .from('meeting-recordings')
        .upload(storagePath, input.webFile, { contentType, upsert: false });
      if (error) throw error;
      return { fileName: input.fileName, storagePath };
    }

    if (!input.uri) throw new Error('Missing audio file path.');
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = session?.access_token;
    if (!supabaseUrl || !anonKey || !accessToken) throw new Error('Not signed in.');

    // Streams from disk — never loads the whole recording into memory.
    const result = await FileSystem.uploadAsync(
      `${supabaseUrl}/storage/v1/object/meeting-recordings/${storagePath}`,
      input.uri,
      {
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          'Content-Type': contentType,
        },
      }
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed (${result.status}).`);
    }
    return { fileName: input.fileName, storagePath };
  };

  const addAudioFiles = async (
    inputs: { fileName: string; mimeType: string | null; webFile?: File | null; uri?: string | null }[]
  ) => {
    if (inputs.length === 0) return;
    setUploadingAudioCount((count) => count + inputs.length);
    for (const input of inputs) {
      try {
        const uploaded = await uploadAudioToStorage(input);
        setNotesImportForm((form) => ({ ...form, audioFiles: [...form.audioFiles, uploaded] }));
      } catch (error) {
        console.error('Voice memo upload failed:', error);
        showAlert('Upload Failed', `Could not upload ${input.fileName}. Please try again.`);
      } finally {
        setUploadingAudioCount((count) => Math.max(0, count - 1));
      }
    }
  };

  const removeAudioFile = (fileIndex: number) => {
    const target = notesImportForm.audioFiles[fileIndex];
    setNotesImportForm((form) => ({
      ...form,
      audioFiles: form.audioFiles.filter((_, index) => index !== fileIndex),
    }));
    if (target) {
      supabase.storage.from('meeting-recordings').remove([target.storagePath]).then(undefined, () => {});
    }
  };

  const handlePickNotesFile = async (audioOnly = false) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: audioOnly
          ? ['audio/*', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav']
          : [
              'application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'text/plain',
              'text/markdown',
              'audio/*',
              'audio/mp4',
              'audio/x-m4a',
            ],
        copyToCacheDirectory: true,
        multiple: true,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const audioAssets = result.assets.filter((asset) => isAudioFileName(asset.name, asset.mimeType));
      const documentAssets = result.assets.filter((asset) => !isAudioFileName(asset.name, asset.mimeType));

      for (const asset of documentAssets) {
        const fileBase64 = await readAssetAsBase64(asset);
        setNotesImportForm((form) => ({
          ...form,
          files: [
            ...form.files,
            {
              fileName: asset.name,
              fileMimeType: asset.mimeType ?? null,
              fileBase64,
            },
          ],
        }));
      }

      await addAudioFiles(audioAssets.map((asset) => ({
        fileName: asset.name,
        mimeType: asset.mimeType ?? null,
        webFile: Platform.OS === 'web' ? asset.file ?? null : null,
        uri: asset.uri,
      })));
    } catch (error) {
      console.error('Error picking meeting notes file:', error);
      showAlert('File Not Imported', 'Could not read that file. Try a voice memo (.m4a), .docx, .pdf, .txt, or paste the notes.');
    }
  };

  const handleDroppedNotesFiles = async (dropped: File[]) => {
    const audioDrops = dropped.filter((file) => isAudioFileName(file.name, file.type));
    const documentDrops = dropped.filter((file) => !isAudioFileName(file.name, file.type));

    for (const file of documentDrops) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const supported =
        file.type.startsWith('image/') ||
        file.type === 'application/pdf' ||
        file.type.startsWith('text/') ||
        ['pdf', 'docx', 'txt', 'md', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension);
      if (!supported) {
        showAlert('File Not Imported', `${file.name} isn't a supported type. Drop voice memos, .docx, .pdf, .txt, or images.`);
        continue;
      }
      try {
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const value = typeof reader.result === 'string' ? reader.result : '';
            resolve(value.includes(',') ? value.split(',').pop() ?? value : value);
          };
          reader.onerror = () => reject(reader.error ?? new Error('Could not read the dropped file.'));
          reader.readAsDataURL(file);
        });
        setNotesImportForm((form) => ({
          ...form,
          files: [...form.files, { fileName: file.name, fileMimeType: file.type || null, fileBase64 }],
        }));
      } catch (error) {
        console.error('Error reading dropped file:', error);
        showAlert('File Not Imported', `Could not read ${file.name}.`);
      }
    }

    await addAudioFiles(audioDrops.map((file) => ({
      fileName: file.name,
      mimeType: file.type || null,
      webFile: file,
    })));
  };

  // While the import sheet is open on web, the whole page is a drop target —
  // drag voice memos (or notes files) from Finder straight in.
  useEffect(() => {
    if (Platform.OS !== 'web' || !showNotesImport || typeof document === 'undefined') return;

    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setNotesDropActive(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if ((event as unknown as { relatedTarget: unknown }).relatedTarget) return;
      setNotesDropActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setNotesDropActive(false);
      void handleDroppedNotesFiles(Array.from(event.dataTransfer?.files ?? []));
    };

    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
      setNotesDropActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drop handlers use functional state updates
  }, [showNotesImport, communityId, session?.access_token]);

  const addNotesPhotos = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/*'],
          copyToCacheDirectory: true,
          multiple: true,
          base64: true,
        });

        if (result.canceled || !result.assets?.length) return;

        const photoFiles = await Promise.all(
          result.assets.slice(0, 5).map(async (asset, index) => {
            const extension = getImageExtension(asset.name || asset.uri, asset.mimeType ?? undefined);
            return {
              fileName: asset.name || `handwritten-notes-${Date.now()}-${index + 1}.${extension}`,
              fileMimeType: asset.mimeType ?? getContentType(extension),
              fileBase64: await readAssetAsBase64(asset),
            };
          })
        );

        setNotesImportForm((form) => ({
          ...form,
          files: [...form.files, ...photoFiles],
        }));
        return;
      }

      const photos = await pickMultipleImages({ maxImages: 5, quality: 0.85 });
      if (photos.length === 0) return;

      const photoFiles = await Promise.all(
        photos.map(async (photo, index) => {
          const extension = getImageExtension(photo.uri, photo.mimeType);
          return {
            fileName: photo.fileName ?? `handwritten-notes-${Date.now()}-${index + 1}.${extension}`,
            fileMimeType: photo.mimeType ?? getContentType(extension),
            fileBase64: await readPhotoAsBase64(photo),
          };
        })
      );

      setNotesImportForm((form) => ({
        ...form,
        files: [...form.files, ...photoFiles],
      }));
    } catch (error) {
      console.error('Error picking notes photos:', error);
      showAlert('Photos Not Added', 'Could not read those note photos. Please try again.');
    }
  };

  const takeNotesPhoto = async () => {
    try {
      const photo = await takePhoto({ quality: 0.85 });
      if (!photo) return;

      const extension = getImageExtension(photo.uri, photo.mimeType);
      const photoFile = {
        fileName: photo.fileName ?? `handwritten-notes-${Date.now()}.${extension}`,
        fileMimeType: photo.mimeType ?? getContentType(extension),
        fileBase64: await readPhotoAsBase64(photo),
      };

      setNotesImportForm((form) => ({
        ...form,
        files: [...form.files, photoFile],
      }));
    } catch (error) {
      console.error('Error taking notes photo:', error);
      showAlert('Photo Not Added', 'Could not read that note photo. Please try again.');
    }
  };

  const removeNotesFile = (fileIndex: number) => {
    setNotesImportForm((form) => ({
      ...form,
      files: form.files.filter((_, index) => index !== fileIndex),
    }));
  };

  const handleImportNotes = async () => {
    if (!communityId) {
      showAlert('Error', 'No active community selected.');
      return;
    }

    const notes = notesImportForm.notes.trim();
    const title = normalizeHiveBrandText(notesImportForm.title).trim() || 'HIVE Meeting';
    const date = parseAmericanDate(notesImportForm.date) ?? notesImportForm.date;
    const hasFile = notesImportForm.files.length > 0;
    const hasAudio = notesImportForm.audioFiles.length > 0;
    const hasPastedNotes = notes.length >= 40;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showAlert('Date Needed', 'Please use a date like 05-12-2026.');
      return;
    }

    if (uploadingAudioCount > 0) {
      showAlert('Still Uploading', 'The voice memos are still uploading — give it a moment, then try again.');
      return;
    }

    if (!hasPastedNotes && !hasFile && !hasAudio) {
      showAlert('Notes Needed', 'Drop in the voice memos, paste the notes, or upload a .docx, .pdf, or text file.');
      return;
    }

    setImportingNotes(true);
    try {
      const { error } = await supabase.functions.invoke('import-meeting-notes', {
        body: {
          communityId,
          title,
          date,
          notesText: hasPastedNotes ? notes : undefined,
          linkedEventId: notesImportForm.linkedEventId,
          files: notesImportForm.files,
          audioFiles: notesImportForm.audioFiles,
        },
      });

      if (error) throw error;

      if (notesImportDraftKey) removeStoredItem(notesImportDraftKey);
      setShowNotesImport(false);
      setNotesImportForm({
        title: 'HIVE Meeting',
        date: toAmericanDate(getTodayIsoDate()),
        notes: '',
        linkedEventId: null,
        files: [],
        audioFiles: [],
      });
      await fetchMeetings();

      showAlert(
        hasAudio ? 'Transcribing' : 'Notes Imported',
        hasAudio
          ? 'The voice memos are transcribing now — the full transcript lands in Meeting Summaries in a few minutes. Then open it and tap Apply Notes when you are ready for Clive.'
          : 'Saved the notes in Meeting Summaries. Open the summary and tap Apply Notes when you are ready for Clive to create tasks, events, and board posts.'
      );
    } catch (error) {
      console.error('Error importing meeting notes:', error);
      showAlert('Import Failed', 'Clive could not import those notes yet. Please try again.');
    } finally {
      setImportingNotes(false);
    }
  };

  if (selectedMeeting) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <MeetingSummary
          meeting={selectedMeeting}
          onBack={() => setSelectedMeeting(null)}
          onMeetingUpdated={(meeting) => {
            setSelectedMeeting(meeting);
            setMeetings((currentMeetings) =>
              currentMeetings.map((currentMeeting) =>
                currentMeeting.id === meeting.id ? meeting : currentMeeting
              )
            );
          }}
        />
      </SafeAreaView>
    );
  }

  const getMeetingCardTitle = (meeting: Meeting) => {
    const parsed = parseMeetingSummaryPreview(meeting.summary);
    return normalizeHiveBrandText(parsed.title) || `Meeting on ${formatDateLong(meeting.date)}`;
  };

  const getMeetingCardStatus = (meeting: Meeting) => {
    // Import states are gone with the notes flow; a meeting is just written or
    // not written now.
    return meeting.processing_status;
  };

  const nextMeeting = upcomingMeetings[0] ?? null;
  /**
   * Tech HIVE meets on Google Meet (migration 191) — the one exception to
   * "the meeting happens in the app". Its next meeting should always carry a
   * Meet link; one scheduled before the flag existed has none, and this is the
   * one-tap repair (Nat, 2026-08-19: "it doesn't have a meeting link...
   * definitely need to update that"). update-meeting adds the link server-side
   * whenever the HIVE is Meet-flagged and the row has none — the fields sent
   * are the meeting's own, unchanged, so nothing else moves.
   */
  const hiveOnMeet = !!community?.meets_on_google_meet;
  const addMeetLink = async (target: Event) => {
    if (addingMeetLink) return;
    setAddingMeetLink(true);
    try {
      const { error } = await supabase.functions.invoke('update-meeting', {
        body: {
          eventId: target.id,
          title: target.title,
          date: target.event_date,
          time: target.event_time || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      if (error) throw error;
      await fetchMeetings();
      showAlert('Done', 'The Google Meet link is on the meeting and the calendar invite now.');
    } catch {
      showAlert('Error', 'Could not add the Meet link. Please try again.');
    } finally {
      setAddingMeetLink(false);
    }
  };
  const hasImportableNotes = notesImportForm.notes.trim().length >= 40 || notesImportForm.files.length > 0;
  const selectedImportMeeting = notesImportForm.linkedEventId
    ? meetingEvents.find((event) => event.id === notesImportForm.linkedEventId)
    : null;

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <AppHeader title="Meetings" />

      <BounceScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Meetings actions */}
        <View
          style={{
            backgroundColor: '#2b2b2a',
            borderRadius: 20,
            padding: 20,
            marginBottom: 20,
          }}
        >
          {/* No "Next up" line — Upcoming Meetings right below already says
              it, and saying it twice made the header read as its own broken
              copy of the list (Nat, 2026-08-19). The empty state stays: with
              nothing scheduled there is nothing below to point at. */}
          {!nextMeeting && (
            <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 18 }}>
              No upcoming meetings scheduled
            </Text>
          )}

          {/* Action tiles */}
          <View style={{ flexDirection: 'row', flexWrap: useCompactActions ? 'wrap' : 'nowrap', gap: 10 }}>
            {/* The Join tile is gone. It opened Google Meet, and since
                2026-08-15 the meeting happens inside HIVE — the faces and the
                deck on one screen. Nat: "the join should bring you inside of
                the meeting helper. Or you just get rid of that join button ...
                we need to make sure that all paths lead to the same campfire."
                Two doors to one room is how somebody ends up sitting alone in
                the empty one. */}

            {/* Meeting Helper — the live deck. Cast it to the TV or follow
                along from any seat (replaced the legacy Canva Slide Deck tile;
                long-press still reaches the old deck-link editor for admins).

                Outside OG the whole tile fails closed — press AND long-press,
                because the long-press sheet is the only door to the Arrival
                Board, which shows check-in answers. The deck's agenda is OG's
                night (News from Nat, Treasurer, HummDinger), not a template. */}
            <Pressable
              onPress={() => {
                if (!meetingDeck) return;
                router.push({ pathname: '/meeting-helper', params: { from: 'meetings' } });
              }}
              onLongPress={() => {
                if (meetingDeck && isAdmin) setShowDeckActions(true);
              }}
              disabled={!meetingDeck}
              style={({ pressed }) => ({
                flex: useCompactActions ? undefined : 1,
                width: useCompactActions ? '48%' : undefined,
                // Gold now that it is the way IN, not one tool among several.
                backgroundColor: meetingDeck ? '#bd9348' : 'rgba(255,255,255,0.08)',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>🎞️</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: meetingDeck ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                Meeting Helper
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  color: meetingDeck ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
                  fontSize: 10,
                  marginTop: 2,
                }}
              >
                {meetingDeck ? (hiveOnMeet ? '' : 'the faces and the deck') : 'coming soon'}
              </Text>
            </Pressable>



            {/* The Newsletter tile is gone (Nat 2026-08-04). Third and last
                place it was duplicated: it was on Admin's Meeting tools, in the
                Newsletter box, and here.

                Same reason each time, and it is not really about duplication.
                There is ONE Buzz across all the HIVEs — that is why The Buzz
                lives at HIVE-Wide and nowhere else — so a "draft the newsletter"
                button inside Tech HIVE's Meetings screen said Tech has a
                newsletter of its own, sitting beside OG's and Production's. It
                is written from the Newsletter box, once, for everybody. */}

            {/* Schedule */}
            <Pressable
              onPress={() => setShowScheduler(true)}
              style={({ pressed }) => ({
                flex: useCompactActions ? undefined : 1,
                width: useCompactActions ? '48%' : undefined,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>📅</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#fff', fontSize: 13 }}>
                Schedule
              </Text>
            </Pressable>
          </View>

          {/* The two things a member fills in before a meeting.
              These sat in Admin, which is the wrong room: they're what you
              reach for on meeting day, not settings.

              The heading used to read "FOR WHOEVER'S RUNNING IT", which put
              them on an organiser's shelf. They belong to the member — Nat,
              2026-08-06: *"those surveys are for my lil bees to fill out so i
              can run the meeting from the meeting helper. lets assume I'm
              always running it (natwalstead) for now."* What you write in them
              is yours; what Nat reads is the meeting deck they feed. */}
          {(isAdmin || !tailoredCheckIns) && (
            <View
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.12)',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {tailoredCheckIns || openCheckIns.length > 0 ? (
                <>
                  <Text
                    style={{
                      fontFamily: 'Lato_700Bold', fontSize: 10, letterSpacing: 1.4,
                      textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
                      width: '100%', marginBottom: 8,
                    }}
                  >
                    Fill these in before the meeting
                  </Text>
                  {/* OG's and Tech's monthly pair. A HIVE without a designed
                      monthly rhythm still gets its own open check-ins below. */}
                  {(tailoredCheckIns ? [
                    { label: 'Monthly Tune-up', params: {} },
                    { label: 'Halfway Check-in', params: { mode: 'midpoint' } },
                  ] as const : []).map((tool) => (
                    <Pressable
                      key={tool.label}
                      onPress={() => router.push({
                        pathname: '/monthly-tuneup' as any,
                        params: { from: 'meetings', ...tool.params },
                      })}
                      style={({ pressed }) => ({
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                        {tool.label}
                      </Text>
                    </Pressable>
                  ))}
                  {openCheckIns.map((survey) => {
                    // Season check-ins wear their emoji; a HIVE's own check-in
                    // just says its name, which is already written to be read.
                    const kind = getSeasonCheckInKind(survey);
                    return (
                      <Pressable
                        key={survey.id}
                        onPress={() => setActiveSeasonSurvey(survey)}
                        style={({ pressed }) => ({
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          borderRadius: 999,
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                          {kind ? `${SEASON_CHECK_IN_EMOJI[kind]} ` : ''}{survey.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                // Not a button — the same sentence Admin shows, sitting where
                // OG's pills sit, so a Tech or Production member learns the
                // plan instead of borrowing OG's rituals.
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 13,
                    lineHeight: 19,
                    color: 'rgba(255,255,255,0.55)',
                    width: '100%',
                  }}
                >
                  {hasEndOfMonthCheckIn(community)
                    ? 'Nothing to fill in right now — the check-ins open a few days before they are due.'
                    : CHECK_INS_COMING_SOON_MESSAGE}
                </Text>
              )}
            </View>
          )}

          {/* Arrival Board pill removed — the deck's Room slide covers it and
              the /arrival-board route still exists for direct links. */}
        </View>

        {/* Upcoming Meetings */}
        {initialLoading && <UpcomingMeetingsSkeleton />}
        {!initialLoading && upcomingMeetings.length > 0 && (
          <FadeIn>
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-800 mb-3">
              Upcoming Meetings
            </Text>
            {upcomingMeetings.map((event) => (
              <View
                key={event.id}
                className="bg-white rounded-xl p-4 mb-3 shadow-sm"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-800">
                      {normalizeHiveBrandText(event.title)}
                    </Text>
                    <Text className="text-sm text-label mt-1">
                      {formatDateLong(event.event_date)}
                      {/* `formatTime`, not the raw column — this line was
                          printing "September 3, 2026 at 17:30:00" (Nat,
                          2026-08-12). The shared formatter has been in
                          dateUtils the whole time. */}
                      {event.event_time ? ` at ${formatTime(event.event_time)}` : ''}
                    </Text>
                    {event.location && (
                      <Text className="text-sm text-gray-600 mt-1">
                        📍 {event.location}
                      </Text>
                    )}
                    {event.description && (
                      <Text className="text-sm text-gray-600 mt-2">
                        {event.description}
                      </Text>
                    )}
                    {/* A Meet HIVE's way in sits ON the meeting, not floating
                        in the header (Nat, 2026-08-19: "that button should be
                        in the upcoming meetings section, not up there in the
                        corner"). In-app HIVEs still get no Join here — their
                        door is the Meeting Helper, and old rows' leftover Meet
                        links stay retired. */}
                    {hiveOnMeet && event.meet_link ? (
                      <Pressable
                        onPress={() => void Linking.openURL(event.meet_link!)}
                        className="bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10 mt-3 self-start"
                      >
                        <Text className="text-xs mr-1.5">📹</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                          Join Google Meet
                        </Text>
                      </Pressable>
                    ) : hiveOnMeet && isAdmin && event.event_type === 'meeting' ? (
                      <Pressable
                        onPress={() => void addMeetLink(event)}
                        disabled={addingMeetLink}
                        className="bg-cream border border-gold/20 py-1.5 px-3 rounded-full mt-3 self-start"
                        style={{ opacity: addingMeetLink ? 0.6 : 1 }}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                          {addingMeetLink ? 'Adding the Meet link…' : 'Add the Google Meet link'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => handleEditEvent(event)}
                      className="bg-gray-200 px-3 py-2 rounded-lg active:bg-gray-300"
                    >
                      <Text className="text-gray-700 font-semibold">Edit</Text>
                    </Pressable>
                    {isAdmin && (
                      <Pressable
                        onPress={() => handleDeleteMeeting(event.id, event.title)}
                        className="bg-charcoal px-3 py-2 rounded-lg active:bg-charcoal/80"
                      >
                        <Text className="text-white font-semibold">X</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
          </FadeIn>
        )}

        {/* Meeting Summaries Header */}
        <Text className="text-lg font-semibold text-gray-800 mb-3">
          Meeting Summaries
        </Text>

        {/* Meeting List */}
        {initialLoading ? (
          <PastRecordingsSkeleton />
        ) : meetings.length === 0 ? (
          <View className="bg-white rounded-xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-4">📝</Text>
            <Text className="text-gray-600 text-center">
              No meeting summaries yet.{'\n'}
              The deck's Wrap-Up slide seals the night's notes here when you meet.
            </Text>
          </View>
        ) : (
          <FadeIn>
          {meetings.map((meeting) => (
            (() => {
              const cardStatus = getMeetingCardStatus(meeting);
              return (
            <View
              key={meeting.id}
              className="bg-white rounded-xl p-4 mb-3 shadow-sm"
            >
              <Pressable
                onPress={() => setSelectedMeeting(meeting)}
                className="flex-row items-center justify-between active:opacity-70"
              >
                <View className="flex-1">
                  <Text className="font-semibold text-gray-800">
                    {getMeetingCardTitle(meeting)}
                  </Text>
                  <Text className="text-sm text-label mt-1">
                    {formatDateLong(meeting.date)}
                  </Text>
                  <Text className="text-sm text-label mt-1">
                    Status:{' '}
                    <Text
                      className={
                        cardStatus === 'complete'
                          ? 'text-green-600'
                          : cardStatus === 'failed'
                          ? 'text-red-600'
                          : 'text-honey-600'
                      }
                    >
                      {cardStatus}
                    </Text>
                  </Text>
                </View>
                <Text className="text-2xl">
                  {meeting.processing_status === 'complete'
                    ? '✓'
                    : meeting.processing_status === 'failed'
                    ? '✗'
                    : '⏳'}
                </Text>
              </Pressable>
              {/* Show Mark Complete button for non-complete meetings */}
              {meeting.processing_status !== 'complete' && (
                <Pressable
                  onPress={() => handleMarkComplete(meeting.id)}
                  className="mt-3 bg-gray-100 py-2 px-4 rounded-lg active:bg-gray-200 self-start"
                >
                  <Text className="text-gray-700 text-sm font-medium">
                    {meeting.processing_status === 'failed' ? 'Skip & Mark Complete' : 'Mark Complete'}
                  </Text>
                </Pressable>
              )}
            </View>
              );
            })()
          ))}
          </FadeIn>
        )}
      </BounceScrollView>

      {/* Schedule Meeting Modal */}
      <ScheduleMeetingModal
        visible={showScheduler}
        onClose={() => setShowScheduler(false)}
        communityId={communityId}
        onSchedule={handleScheduleMeeting}
      />


      {/* Edit Meeting Modal */}
      <Modal
        visible={!!editingEvent}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEventEdit}
      >
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Pressable onPress={closeEventEdit}>
              <Text className="text-label text-base">Cancel</Text>
            </Pressable>
            <Text className="text-lg font-bold text-hive-dark">Edit Meeting</Text>
            <Pressable
              onPress={handleSaveEdit}
              disabled={savingEdit || !editForm.title.trim()}
              className={savingEdit || !editForm.title.trim() ? 'opacity-50' : ''}
            >
              <Text className="text-honey-600 text-base font-semibold">
                {savingEdit ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>

          <BounceScrollView className="flex-1 p-4">
            {/* "Hive" typed anywhere in the title still becomes "HIVE", and it
                does so for a spoken title too — the fix sits on the way in, not
                on the keystroke. */}
            <ComposerBar
              variant="form"
              containerClassName="mb-4"
              label="Title"
              value={editForm.title}
              onChangeText={(next) => setEditForm((f) => ({
                ...f,
                title: normalizeHiveBrandText(typeof next === 'function' ? next(f.title ?? '') : next),
              }))}
              placeholder="HIVE Meeting"
              multiline={false}
              onSubmit={handleSaveEdit}
              canSubmit={!!editForm.title.trim() && !savingEdit}
              submitting={savingEdit}
            />

            <ComposerBar
              variant="form"
              containerClassName="mb-4"
              label="Description"
              value={editForm.description}
              onChangeText={(next) => setEditForm((f) => ({
                ...f,
                description: typeof next === 'function' ? next(f.description ?? '') : next,
              }))}
              placeholder="Optional description"
              minHeight={90}
              onSubmit={handleSaveEdit}
              canSubmit={!!editForm.title.trim() && !savingEdit}
              submitting={savingEdit}
            />

            {/* Where to meet is words — "Joe's Coffee", "the big park by the
                library" — and people dictate addresses all day long, so this
                one keeps the microphone. */}
            <ComposerBar
              variant="form"
              containerClassName="mb-4"
              label="Location / Address"
              value={editForm.location}
              onChangeText={(next) => setEditForm((f) => ({
                ...f,
                location: typeof next === 'function' ? next(f.location ?? '') : next,
              }))}
              placeholder="e.g., 123 Main St or Joe's Coffee"
              multiline={false}
              onSubmit={handleSaveEdit}
              canSubmit={!!editForm.title.trim() && !savingEdit}
              submitting={savingEdit}
            />

            <View className="mb-4">
              <EventDatePicker
                value={editForm.event_date}
                onChange={(val) => setEditForm((f) => ({ ...f, event_date: val }))}
              />
            </View>

            {/* A clock time is not words, so no microphone — just the same
                white fill and gold hairline as the boxes above it. */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className={FIELD_LABEL_CLASS}>Time (optional)</Text>
              <TextInput
                value={editForm.event_time}
                onChangeText={(text) => setEditForm((f) => ({ ...f, event_time: text }))}
                className="rounded-xl px-4 py-3 text-base bg-white"
                style={{ fontFamily: 'Lato_400Regular', borderWidth: 1, borderColor: FIELD_BORDER }}
                placeholder="e.g. 6:00 PM"
                placeholderTextColor={PLACEHOLDER_INK}
                returnKeyType="send"
                onSubmitEditing={handleSaveEdit}
              />
            </View>

            <View className="bg-gray-50 rounded-lg p-4 mt-4">
              <Text className="text-sm text-gray-600">
                {/* A Meet HIVE's call is on Google Meet; everyone else meets
                    inside the app. The one-door line was showing on Tech,
                    whose door is deliberately different (migration 191). */}
                {hiveOnMeet
                  ? '📹 This HIVE meets on Google Meet — saving adds the Meet link to the calendar invite if it is missing. The deck still lives in the Meeting Helper.'
                  : '🎞️ This meeting happens in the Meeting Helper — the faces and the deck on one screen. The calendar invite points there.'}
              </Text>
              {/* The receipt. Nat saved twice because nothing in this form
                  showed the link existed (2026-08-19: "it says it's there and
                  if I click edit, I still don't see it"). */}
              {hiveOnMeet && editingEvent?.meet_link ? (
                <Text className="text-sm text-gray-600 mt-2" selectable>
                  ✓ On the invite: {editingEvent.meet_link}
                </Text>
              ) : null}
            </View>
          </BounceScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Slide deck actions */}
      <Modal visible={showDeckActions} animationType="fade" transparent onRequestClose={() => setShowDeckActions(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityLabel="Close slide deck actions"
            onPress={() => setShowDeckActions(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', overflow: 'hidden' }}
          >
            {/* Three buttons today, and an admin sees all three — the ceiling
                and the scroll are here so the fourth one somebody adds later
                doesn't quietly fall off the end of the sheet. */}
            <BounceScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 4 }}>HIVE Slide Deck</Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginBottom: 16, lineHeight: 18 }}>
              Open the view-only deck for the group, or jump into Canva to keep editing the staple deck.
            </Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => {
                  setShowDeckActions(false);
                  handleOpenSlideDeck(effectiveSlideDeckUrl);
                }}
                style={{ backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>View Deck</Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  onPress={() => {
                    setShowDeckActions(false);
                    router.push({ pathname: '/arrival-board', params: { from: 'meetings' } });
                  }}
                  style={{ backgroundColor: '#f0ede6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#8e7a5e' }}>📺 Arrival Board</Text>
                </Pressable>
              )}
              {isAdmin && (
                <Pressable
                  onPress={() => {
                    setShowDeckActions(false);
                    setDeckUrlDraft(slideDeckUrl.trim() || DEFAULT_HIVE_DECK_VIEW_URL);
                    setShowDeckEdit(true);
                  }}
                  style={{ backgroundColor: '#f0ede6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#8e7a5e' }}>Change View Link</Text>
                </Pressable>
              )}
            </View>
            </BounceScrollView>
          </Pressable>
        </View>
      </Modal>

      {/* Admin: edit slide deck URL */}
      <Modal visible={showDeckEdit} animationType="slide" transparent onRequestClose={() => setShowDeckEdit(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityLabel="Close slide deck editor"
            onPress={() => setShowDeckEdit(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }} pointerEvents="box-none">
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', overflow: 'hidden' }}
            >
              {/* Same rule as every other sheet: a ceiling and something to
                  scroll, so Save Link cannot end up under the bottom edge when
                  the keyboard is up on a short screen. */}
              <BounceScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 4 }}>Slide Deck URL</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginBottom: 16, lineHeight: 18 }}>
                Paste the Canva "View" link (not the edit link). The view link always shows the latest saved version.{'\n\n'}In Canva: Share → Copy link → choose "View only".
              </Text>
              {/* A pasted link, so no microphone — dictating a URL is a joke.
                  It wears the composer's hairline and placeholder ink instead. */}
              <TextInput
                value={deckUrlDraft}
                onChangeText={setDeckUrlDraft}
                placeholder="https://www.canva.com/design/..."
                placeholderTextColor={PLACEHOLDER_INK}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSaveDeckUrl}
                style={{
                  fontFamily: FIELD_LOOK.font,
                  // A URL is long, so this one field reads a step smaller than
                  // the standard 16 — everything else about it is the shared look.
                  fontSize: 14,
                  color: FIELD_LOOK.ink,
                  backgroundColor: FIELD_LOOK.fill,
                  borderRadius: FIELD_LOOK.radius,
                  borderWidth: 1,
                  borderColor: FIELD_BORDER,
                  padding: 14,
                  marginBottom: 16,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setShowDeckEdit(false)}
                  style={{ flex: 1, backgroundColor: '#f0ede6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#8e7a5e' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveDeckUrl}
                  disabled={savingDeckUrl}
                  style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: savingDeckUrl ? 0.7 : 1 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>
                    {savingDeckUrl ? 'Saving…' : 'Save Link'}
                  </Text>
                </Pressable>
              </View>
              </BounceScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {activeSeasonSurvey ? (
        <SurveyModal
          survey={activeSeasonSurvey}
          initialAnswers={myResponses.get(activeSeasonSurvey.id)?.answers}
          isEditingResponse={!!myResponses.get(activeSeasonSurvey.id)}
          onSubmit={(answers) => submitSeasonSurvey(activeSeasonSurvey.id, answers)}
          onClose={() => setActiveSeasonSurvey(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

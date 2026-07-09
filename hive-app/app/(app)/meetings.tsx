import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Linking, useWindowDimensions, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { pickMultipleImages, takePhoto, getImageExtension, getContentType } from '../../lib/imagePicker';
import { MeetingSummary } from '../../components/meetings/MeetingSummary';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal';
import { AppHeader } from '../../components/navigation';
import { FadeIn } from '../../components/ui/FadeIn';
import { UpcomingMeetingsSkeleton, PastRecordingsSkeleton } from '../../components/meetings/MeetingsSkeleton';
import { formatDateLong, parseAmericanDate } from '../../lib/dateUtils';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import type { Meeting, Event } from '../../types';

interface MeetingSummaryPreview {
  title?: string;
  source?: string;
  import_status?: 'pending' | 'preview' | 'applied';
  summary?: string;
  decisions?: string[];
  board_suggestions?: unknown[];
}

interface NotesImportFile {
  fileName: string;
  fileMimeType: string | null;
  fileBase64: string;
}

type NotesImportForm = {
  title: string;
  date: string;
  notes: string;
  linkedEventId: string | null;
  files: NotesImportFile[];
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

const getIsMobileWeb = () => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
};

const openExternalUrl = async (url: string, errorMessage: string) => {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    Alert.alert('Error', errorMessage);
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
    Alert.alert('Error', errorMessage);
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

const normalizeHiveBrandText = (text?: string | null) => (text ?? '').replace(/\bHive\b/g, 'HIVE');

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
  const { profile, communityId, session, communityRole, community, refreshProfile } = useAuth();
  const { width } = useWindowDimensions();
  const useCompactActions = width < 640;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
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
      Alert.alert('Error', 'Could not save the slide deck link. Please try again.');
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
  });
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editForm, setEditForm] = useState<EventEditForm>({
    title: '',
    description: '',
    location: '',
    event_date: '',
    event_time: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
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

    setNotesImportForm(savedDraft.form);
    if (savedDraft.active) {
      setShowNotesImport(true);
    }
  }, [notesImportDraftKey]);

  useEffect(() => {
    if (!notesImportDraftKey) return;

    const hasDraftContent =
      notesImportForm.notes.trim().length > 0 ||
      notesImportForm.files.length > 0 ||
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

    Alert.alert(
      'Meeting Scheduled',
      'Your meeting has been created with a Google Meet link. All HIVE members can see it.',
      [{ text: 'OK' }]
    );

    await fetchMeetings();
  };

  const handleJoinMeeting = (meetLink: string) => {
    Linking.openURL(meetLink).catch(() => {
      Alert.alert('Error', 'Could not open the meeting link');
    });
  };

  const handleDeleteMeeting = (eventId: string, title: string) => {
    const displayTitle = normalizeHiveBrandText(title);
    const doDelete = async () => {
      // Call edge function to delete from Google Calendar and database
      const { error } = await supabase.functions.invoke('delete-meeting', {
        body: { eventId },
      });

      if (error) {
        Alert.alert('Error', `Failed to delete meeting: ${error.message}`);
        console.error('Delete error:', error);
      } else {
        await fetchMeetings();
      }
    };

    // Use window.confirm on web, Alert.alert on native
    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${displayTitle}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Meeting',
        `Are you sure you want to delete "${displayTitle}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleMarkComplete = async (meetingId: string) => {
    const doMark = async () => {
      const { error } = await supabase
        .from('meetings')
        .update({ processing_status: 'complete' })
        .eq('id', meetingId);

      if (error) {
        Alert.alert('Error', 'Failed to update meeting status');
      } else {
        await fetchMeetings();
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Mark this meeting as complete? You can add notes manually.')) {
        doMark();
      }
    } else {
      Alert.alert(
        'Mark Complete',
        'Mark this meeting as complete? You can add notes manually.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark Complete', onPress: doMark },
        ]
      );
    }
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
      Alert.alert('Success', 'Meeting updated');
    } catch (error) {
      console.error('Error updating event:', error);
      Alert.alert('Error', 'Failed to update meeting');
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

  const handlePickNotesFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/markdown',
        ],
        copyToCacheDirectory: true,
        multiple: false,
        base64: Platform.OS === 'web',
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
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
    } catch (error) {
      console.error('Error picking meeting notes file:', error);
      Alert.alert('File Not Imported', 'Could not read that notes file. Try a .docx, .pdf, .txt, or paste the notes.');
    }
  };

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
      Alert.alert('Photos Not Added', 'Could not read those note photos. Please try again.');
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
      Alert.alert('Photo Not Added', 'Could not read that note photo. Please try again.');
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
      Alert.alert('Error', 'No active community selected.');
      return;
    }

    const notes = notesImportForm.notes.trim();
    const title = normalizeHiveBrandText(notesImportForm.title).trim() || 'HIVE Meeting';
    const date = parseAmericanDate(notesImportForm.date) ?? notesImportForm.date;
    const hasFile = notesImportForm.files.length > 0;
    const hasPastedNotes = notes.length >= 40;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Date Needed', 'Please use a date like 05-12-2026.');
      return;
    }

    if (!hasPastedNotes && !hasFile) {
      Alert.alert('Notes Needed', 'Paste the Gemini notes or upload a .docx, .pdf, or text file.');
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
      });
      await fetchMeetings();

      Alert.alert(
        'Notes Imported',
        'Saved the notes in Meeting Summaries. Open the summary and tap Apply Notes when you are ready for Clive to create tasks, events, and board posts.'
      );
    } catch (error) {
      console.error('Error importing meeting notes:', error);
      Alert.alert('Import Failed', 'Clive could not import those notes yet. Please try again.');
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
    const parsed = parseMeetingSummaryPreview(meeting.summary);
    if (parsed.import_status === 'pending') return 'needs preview';
    if (parsed.import_status === 'preview') return 'needs review';
    if (parsed.import_status === 'applied') return 'applied';
    return meeting.processing_status;
  };

  const nextMeeting = upcomingMeetings[0] ?? null;
  const hasImportableNotes = notesImportForm.notes.trim().length >= 40 || notesImportForm.files.length > 0;
  const selectedImportMeeting = notesImportForm.linkedEventId
    ? meetingEvents.find((event) => event.id === notesImportForm.linkedEventId)
    : null;

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <AppHeader title="Meetings" />

      <ScrollView
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
          {nextMeeting ? (
            <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 18 }}>
              Next up: {formatDateLong(nextMeeting.event_date)}{nextMeeting.event_time ? ` · ${nextMeeting.event_time}` : ''}
            </Text>
          ) : (
            <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 18 }}>
              No upcoming meetings scheduled
            </Text>
          )}

          {/* Action tiles */}
          <View style={{ flexDirection: 'row', flexWrap: useCompactActions ? 'wrap' : 'nowrap', gap: 10 }}>
            {/* Join */}
            <Pressable
              onPress={() => nextMeeting?.meet_link ? handleJoinMeeting(nextMeeting.meet_link) : null}
              style={({ pressed }) => ({
                flex: useCompactActions ? undefined : 1,
                width: useCompactActions ? '48%' : undefined,
                backgroundColor: nextMeeting?.meet_link ? '#bd9348' : 'rgba(255,255,255,0.08)',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>📹</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: nextMeeting?.meet_link ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                Join
              </Text>
            </Pressable>

            {/* Slide Deck */}
            <Pressable
              onPress={handleSlideDeckPress}
              onLongPress={() => {
                if (isAdmin) {
                  setShowDeckActions(true);
                } else {
                  void fetchLatestSlideDeckUrl();
                }
              }}
              style={({ pressed }) => ({
                flex: useCompactActions ? undefined : 1,
                width: useCompactActions ? '48%' : undefined,
                backgroundColor: effectiveSlideDeckUrl ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>🎞️</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: effectiveSlideDeckUrl ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                Slide Deck
              </Text>
              {isAdmin && (
                <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>
                  view / edit
                </Text>
              )}
            </Pressable>

            {/* Import Notes */}
            <Pressable
              onPress={() => openNotesImport()}
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
              <Text style={{ fontSize: 22, marginBottom: 4 }}>📝</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#fff', fontSize: 13 }}>
                Import Notes
              </Text>
            </Pressable>

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

          {/* Arrival Board — live check-in view for everyone on meeting day */}
          <Pressable
            onPress={() => router.push('/arrival-board')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              marginTop: 12,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ fontSize: 14 }}>📺</Text>
            <Text style={{ fontFamily: 'Lato_700Bold', color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
              Arrival Board — who's in the room
            </Text>
          </Pressable>
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
                    <Text className="text-sm text-gray-500 mt-1">
                      {formatDateLong(event.event_date)}
                      {event.event_time ? ` at ${event.event_time}` : ''}
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
                  </View>
                  <View className="flex-row items-center gap-2">
                    {event.meet_link && (
                      <Pressable
                        onPress={() => handleJoinMeeting(event.meet_link!)}
                        className="bg-honey-500 px-4 py-2 rounded-lg active:bg-honey-600"
                      >
                        <Text className="text-white font-semibold">Join</Text>
                      </Pressable>
                    )}
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
              Import Gemini notes after your next HIVE gathering.
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
                  <Text className="text-sm text-gray-500 mt-1">
                    {formatDateLong(meeting.date)}
                  </Text>
                  <Text className="text-sm text-gray-500 mt-1">
                    Status:{' '}
                    <Text
                      className={
                        cardStatus === 'applied' || cardStatus === 'complete'
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
                  {cardStatus === 'needs preview' || cardStatus === 'needs review'
                    ? '↪'
                    : meeting.processing_status === 'complete'
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
      </ScrollView>

      {/* Schedule Meeting Modal */}
      <ScheduleMeetingModal
        visible={showScheduler}
        onClose={() => setShowScheduler(false)}
        communityId={communityId}
        onSchedule={handleScheduleMeeting}
      />

      {/* Import Gemini meeting notes */}
      <Modal
        visible={showNotesImport}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeNotesImport}
      >
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
              <Pressable onPress={closeNotesImport} disabled={importingNotes}>
                <Text className="text-gray-500 text-base">Cancel</Text>
              </Pressable>
              <Text className="text-lg font-bold text-hive-dark">Import Notes</Text>
              <Pressable
                onPress={handleImportNotes}
                disabled={importingNotes || !hasImportableNotes}
                className={importingNotes || !hasImportableNotes ? 'opacity-50' : ''}
              >
                <Text className="text-honey-600 text-base font-semibold">
                  {importingNotes ? 'Importing...' : 'Import'}
                </Text>
              </Pressable>
            </View>

            <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-700 mb-1">Meeting</Text>
                <View className="border border-gray-300 rounded-lg p-3 bg-white">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-800">
                        {selectedImportMeeting ? normalizeHiveBrandText(selectedImportMeeting.title) : 'Not linked to a scheduled meeting'}
                      </Text>
                      <Text className="text-sm text-gray-500 mt-1">
                        {selectedImportMeeting
                          ? `${formatDateLong(selectedImportMeeting.event_date)}${selectedImportMeeting.event_time ? ` at ${selectedImportMeeting.event_time}` : ''}`
                          : 'Use this for older notes, hand notes, or anything not on the calendar.'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setShowMeetingPicker((showing) => !showing)}
                      className="bg-gray-100 px-3 py-2 rounded-lg active:bg-gray-200"
                    >
                      <Text className="text-gray-700 font-semibold">
                        {showMeetingPicker ? 'Done' : 'Choose'}
                      </Text>
                    </Pressable>
                  </View>

                  {showMeetingPicker && (
                    <View className="mt-3 pt-3 border-t border-gray-200">
                      <Pressable
                        onPress={() => selectNotesImportMeeting(null)}
                        className={`rounded-lg p-3 mb-2 active:bg-gray-100 ${!notesImportForm.linkedEventId ? 'bg-honey-50 border border-honey-200' : 'bg-gray-50'}`}
                      >
                        <Text className="font-semibold text-gray-800">Standalone notes</Text>
                        <Text className="text-sm text-gray-500 mt-1">Do not link to a scheduled meeting.</Text>
                      </Pressable>

                      {meetingEvents.length === 0 ? (
                        <Text className="text-sm text-gray-500 p-3">
                          No scheduled meetings found yet.
                        </Text>
                      ) : (
                        meetingEvents.map((event) => (
                          <Pressable
                            key={event.id}
                            onPress={() => selectNotesImportMeeting(event)}
                            className={`rounded-lg p-3 mb-2 active:bg-gray-100 ${notesImportForm.linkedEventId === event.id ? 'bg-honey-50 border border-honey-200' : 'bg-gray-50'}`}
                          >
                            <Text className="font-semibold text-gray-800">{normalizeHiveBrandText(event.title)}</Text>
                            <Text className="text-sm text-gray-500 mt-1">
                              {formatDateLong(event.event_date)}{event.event_time ? ` at ${event.event_time}` : ''}
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                  )}
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-700 mb-1">Title</Text>
                <TextInput
                  value={notesImportForm.title}
                  onChangeText={(title) => setNotesImportForm((form) => ({ ...form, title: normalizeHiveBrandText(title) }))}
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="HIVE Meeting"
                />
              </View>

              <View className="mb-4">
                <EventDatePicker
                  value={notesImportForm.date}
                  onChange={(date) => setNotesImportForm((form) => ({ ...form, date }))}
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-700 mb-1">Notes File</Text>
                {notesImportForm.files.length > 0 && (
                  <View className="border border-honey-200 bg-honey-50 rounded-lg p-3 mb-3">
                    {notesImportForm.files.map((file, index) => (
                      <View key={`${file.fileName}-${index}`} className={index > 0 ? 'mt-3 pt-3 border-t border-honey-200' : ''}>
                        <Text className="text-honey-900 font-medium">{file.fileName}</Text>
                        <Pressable
                          onPress={() => removeNotesFile(index)}
                          className="bg-gray-200 px-3 py-2 rounded-lg active:bg-gray-300 self-start mt-2"
                        >
                          <Text className="text-gray-700 font-semibold">Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={handlePickNotesFile}
                    className="border border-dashed border-gray-300 rounded-lg px-4 py-3 active:bg-gray-50"
                  >
                    <Text className="text-gray-700 font-semibold">Upload file</Text>
                  </Pressable>
                  <Pressable
                    onPress={addNotesPhotos}
                    className="border border-dashed border-gray-300 rounded-lg px-4 py-3 active:bg-gray-50"
                  >
                    <Text className="text-gray-700 font-semibold">Add photos</Text>
                  </Pressable>
                  {Platform.OS !== 'web' && (
                    <Pressable
                      onPress={takeNotesPhoto}
                      className="border border-dashed border-gray-300 rounded-lg px-4 py-3 active:bg-gray-50"
                    >
                      <Text className="text-gray-700 font-semibold">Take photo</Text>
                      </Pressable>
                  )}
                </View>
                {notesImportForm.files.length === 0 && (
                  <Text className="text-gray-500 text-sm mt-2">
                    Upload .docx, .pdf, .txt, .md, or photos of handwritten notes. Or paste the notes below.
                  </Text>
                )}
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-700 mb-1">Gemini Notes</Text>
                <TextInput
                  value={notesImportForm.notes}
                  onChangeText={(notes) => setNotesImportForm((form) => ({ ...form, notes }))}
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="Paste Google Meet notes here"
                  multiline
                  blurOnSubmit={false}
                  onKeyPress={submitOnEnter(handleImportNotes)}
                  textAlignVertical="top"
                  style={{ minHeight: 260 }}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

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
              <Text className="text-gray-500 text-base">Cancel</Text>
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

          <ScrollView className="flex-1 p-4">
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-1">Title</Text>
              <TextInput
                value={editForm.title}
                onChangeText={(text) => setEditForm((f) => ({ ...f, title: normalizeHiveBrandText(text) }))}
                className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                placeholder="HIVE Meeting"
                returnKeyType="send"
                onSubmitEditing={handleSaveEdit}
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-1">Description</Text>
              <TextInput
                value={editForm.description}
                onChangeText={(text) => setEditForm((f) => ({ ...f, description: text }))}
                className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                placeholder="Optional description"
                multiline
                blurOnSubmit={false}
                onKeyPress={submitOnEnter(handleSaveEdit)}
                numberOfLines={3}
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-1">Location / Address</Text>
              <TextInput
                value={editForm.location}
                onChangeText={(text) => setEditForm((f) => ({ ...f, location: text }))}
                className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                placeholder="e.g., 123 Main St or Joe's Coffee"
                returnKeyType="send"
                onSubmitEditing={handleSaveEdit}
              />
            </View>

            <View className="mb-4">
              <EventDatePicker
                value={editForm.event_date}
                onChange={(val) => setEditForm((f) => ({ ...f, event_date: val }))}
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-1">Time (optional)</Text>
              <TextInput
                value={editForm.event_time}
                onChangeText={(text) => setEditForm((f) => ({ ...f, event_time: text }))}
                className="border border-gray-300 rounded-lg px-4 py-3 text-base bg-cream"
                placeholder="e.g. 6:00 PM"
                returnKeyType="send"
                onSubmitEditing={handleSaveEdit}
              />
            </View>

            {editingEvent?.meet_link && (
              <View className="bg-gray-50 rounded-lg p-4 mt-4">
                <Text className="text-sm text-gray-600">
                  📹 This meeting has a Google Meet link attached
                </Text>
              </View>
            )}
          </ScrollView>
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
            style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}
          >
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
                    router.push('/arrival-board');
                  }}
                  style={{ backgroundColor: '#f0ede6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#6b7280' }}>📺 Arrival Board</Text>
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
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#6b7280' }}>Change View Link</Text>
                </Pressable>
              )}
            </View>
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
              style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}
            >
              <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 4 }}>Slide Deck URL</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginBottom: 16, lineHeight: 18 }}>
                Paste the Canva "View" link (not the edit link). The view link always shows the latest saved version.{'\n\n'}In Canva: Share → Copy link → choose "View only".
              </Text>
              <TextInput
                value={deckUrlDraft}
                onChangeText={setDeckUrlDraft}
                placeholder="https://www.canva.com/design/..."
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSaveDeckUrl}
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 14,
                  color: '#2d2d2d',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(189,147,72,0.35)',
                  padding: 14,
                  marginBottom: 16,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setShowDeckEdit(false)}
                  style={{ flex: 1, backgroundColor: '#f0ede6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#6b7280' }}>Cancel</Text>
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
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

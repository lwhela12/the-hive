import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Linking, useWindowDimensions, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { pickMultipleImages, takePhoto, getImageExtension, getContentType } from '../../lib/imagePicker';
import { MeetingSummary } from '../../components/meetings/MeetingSummary';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { FadeIn } from '../../components/ui/FadeIn';
import { UpcomingMeetingsSkeleton, PastRecordingsSkeleton } from '../../components/meetings/MeetingsSkeleton';
import { formatDateLong, parseAmericanDate } from '../../lib/dateUtils';
import { EventDatePicker } from '../../components/ui/DatePicker';
import type { Meeting, Event } from '../../types';

interface MeetingSummaryPreview {
  title?: string;
  source?: string;
  import_status?: 'pending' | 'applied';
  summary?: string;
  decisions?: string[];
  board_suggestions?: unknown[];
}

interface NotesImportFile {
  fileName: string;
  fileMimeType: string | null;
  fileBase64: string;
}

const toAmericanDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');
  return month && day && year ? `${month}-${day}-${year}` : isoDate;
};

const getTodayIsoDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
};

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
  const { profile, communityId, session, communityRole, community, refreshProfile } = useAuth();
  const { totalUnread: unreadDMCount } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const { width } = useWindowDimensions();
  const useMobileLayout = width < 768;
  const useCompactActions = width < 640;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  // Slide deck URL — pulled from community record, editable by admin
  const [slideDeckUrl, setSlideDeckUrl] = useState(community?.slide_deck_url ?? '');
  const [showDeckEdit, setShowDeckEdit] = useState(false);
  const [deckUrlDraft, setDeckUrlDraft] = useState('');
  const [savingDeckUrl, setSavingDeckUrl] = useState(false);

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
      return slideDeckUrl;
    }

    const latestUrl = data?.slide_deck_url ?? '';
    setSlideDeckUrl(latestUrl);
    return latestUrl;
  }, [communityId, slideDeckUrl]);

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
  const [upcomingMeetings, setUpcomingMeetings] = useState<Event[]>([]);
  const [meetingEvents, setMeetingEvents] = useState<Event[]>([]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showNotesImport, setShowNotesImport] = useState(false);
  const [showMeetingPicker, setShowMeetingPicker] = useState(false);
  const [importingNotes, setImportingNotes] = useState(false);
  const [notesImportForm, setNotesImportForm] = useState({
    title: '',
    date: toAmericanDate(getTodayIsoDate()),
    notes: '',
    linkedEventId: null as string | null,
    files: [] as NotesImportFile[],
  });
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    location: '',
    event_date: '',
    event_time: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

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
      if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Meeting',
        `Are you sure you want to delete "${title}"?`,
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
    setEditForm({
      title: event.title,
      description: event.description || '',
      location: event.location || '',
      event_date: (() => {
        const [y, m, d] = event.event_date.split('-');
        return `${m}-${d}-${y}`;
      })(),
      event_time: event.event_time || '',
    });
    setEditingEvent(event);
  };

  const handleSaveEdit = async () => {
    if (!editingEvent) return;

    setSavingEdit(true);
    try {
      // Use edge function to update both database and Google Calendar
      const { error } = await supabase.functions.invoke('update-meeting', {
        body: {
          eventId: editingEvent.id,
          title: editForm.title,
          description: editForm.description || null,
          location: editForm.location || null,
          date: parseAmericanDate(editForm.event_date) ?? editForm.event_date,
          time: editForm.event_time || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      if (error) throw error;

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
    const date = event?.event_date ?? getTodayIsoDate();
    setNotesImportForm({
      title: event?.title ?? 'HIVE Meeting',
      date: toAmericanDate(date),
      notes: '',
      linkedEventId: event?.id ?? null,
      files: [],
    });
    setShowMeetingPicker(false);
    setShowNotesImport(true);
  };

  const selectNotesImportMeeting = (event: Event | null) => {
    if (event) {
      setNotesImportForm((form) => ({
        ...form,
        title: event.title,
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
      const photos = await pickMultipleImages({ maxImages: 5, quality: 0.85 });
      if (photos.length === 0) return;

      const photoFiles = await Promise.all(
        photos.map(async (photo, index) => {
          const extension = getImageExtension(photo.uri, photo.mimeType);
          return {
            fileName: photo.fileName ?? `handwritten-notes-${Date.now()}-${index + 1}.${extension}`,
            fileMimeType: photo.mimeType ?? getContentType(extension),
            fileBase64: await FileSystem.readAsStringAsync(photo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            }),
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
        fileBase64: await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
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
    const title = notesImportForm.title.trim() || 'HIVE Meeting';
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

      setShowNotesImport(false);
      setNotesImportForm({
        title: '',
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
    return parsed.title || `Meeting on ${formatDateLong(meeting.date)}`;
  };

  const getMeetingCardStatus = (meeting: Meeting) => {
    const parsed = parseMeetingSummaryPreview(meeting.summary);
    if (parsed.import_status === 'pending') return 'needs apply';
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
      <AppHeader
        title="Meeting Hub"
        onMenuPress={useMobileLayout ? () => setDrawerOpen(true) : undefined}
      />

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
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Meeting Hub Actions */}
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
              onPress={async () => {
                const latestUrl = await fetchLatestSlideDeckUrl();
                if (latestUrl) {
                  Linking.openURL(latestUrl);
                } else if (isAdmin) {
                  setDeckUrlDraft('');
                  setShowDeckEdit(true);
                }
              }}
              onLongPress={() => {
                if (isAdmin) { setDeckUrlDraft(slideDeckUrl); setShowDeckEdit(true); }
              }}
              style={({ pressed }) => ({
                flex: useCompactActions ? undefined : 1,
                width: useCompactActions ? '48%' : undefined,
                backgroundColor: slideDeckUrl ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>🎞️</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: slideDeckUrl ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                Slide Deck
              </Text>
              {isAdmin && (
                <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>
                  {slideDeckUrl ? 'hold to edit' : 'tap to set'}
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
                      {event.title}
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
                  {cardStatus === 'needs apply'
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
        onRequestClose={() => setShowNotesImport(false)}
      >
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
              <Pressable onPress={() => setShowNotesImport(false)} disabled={importingNotes}>
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
                        {selectedImportMeeting ? selectedImportMeeting.title : 'Not linked to a scheduled meeting'}
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
                            <Text className="font-semibold text-gray-800">{event.title}</Text>
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
                  onChangeText={(title) => setNotesImportForm((form) => ({ ...form, title }))}
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
        onRequestClose={() => setEditingEvent(null)}
      >
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Pressable onPress={() => setEditingEvent(null)}>
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
                onChangeText={(text) => setEditForm((f) => ({ ...f, title: text }))}
                className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                placeholder="Meeting title"
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

      {/* Admin: edit slide deck URL */}
      <Modal visible={showDeckEdit} animationType="slide" transparent onRequestClose={() => setShowDeckEdit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

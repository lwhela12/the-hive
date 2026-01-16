import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Linking, useWindowDimensions, Platform, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { AudioRecorder } from '../../components/meetings/AudioRecorder';
import { MeetingSummary } from '../../components/meetings/MeetingSummary';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { formatDateLong } from '../../lib/dateUtils';
import type { Meeting, Event } from '../../types';

export default function MeetingsScreen() {
  const { profile, communityId, session } = useAuth();
  const { width } = useWindowDimensions();
  const useMobileLayout = width < 768;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Event[]>([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
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

    // Fetch past meetings (recordings)
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('community_id', communityId)
      .order('date', { ascending: false })
      .limit(20);

    if (!error && data) {
      setMeetings(data);
    }

    // Fetch upcoming scheduled meetings - use local date to avoid timezone issues
    const now = new Date();
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(10);

    if (!eventsError && events) {
      setUpcomingMeetings(events);
    }
  }, [communityId]);

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
      throw new Error(response.error.message || 'Failed to schedule meeting');
    }

    Alert.alert(
      'Meeting Scheduled',
      'Your meeting has been created with a Google Meet link. All Hive members can see it.',
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

  const isAdmin = profile?.role === 'admin';

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
      event_date: event.event_date,
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
          date: editForm.event_date,
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

  const handleRecordingComplete = async (audioPath: string) => {
    if (!communityId) {
      Alert.alert('Error', 'No active community selected.');
      return;
    }
    try {
      // Use local date to avoid timezone issues
      const now = new Date();
      const localDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

      // Create meeting record
      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          date: localDate,
          audio_url: audioPath,
          recorded_by: profile?.id,
          processing_status: 'pending',
          community_id: communityId,
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger transcription automatically
      const { error: transcribeError } = await supabase.functions.invoke('transcribe', {
        body: { meeting_id: meeting.id }
      });

      if (transcribeError) {
        console.error('Failed to start transcription:', transcribeError);
      }

      setShowRecorder(false);
      await fetchMeetings();
      Alert.alert(
        'Meeting Recorded',
        'Your meeting has been saved and transcription has started. This may take a few minutes.'
      );
    } catch (error) {
      console.error('Error saving meeting:', error);
      Alert.alert('Error', 'Failed to save meeting recording.');
    }
  };

  if (showRecorder) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <AudioRecorder
          onComplete={handleRecordingComplete}
          onCancel={() => setShowRecorder(false)}
        />
      </SafeAreaView>
    );
  }

  if (selectedMeeting) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <MeetingSummary
          meeting={selectedMeeting}
          onBack={() => setSelectedMeeting(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout && (
        <AppHeader
          title="Meetings"
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
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View className={`flex-row items-center mb-6 ${useMobileLayout ? 'justify-end' : 'justify-between'}`}>
          {!useMobileLayout && <Text className="text-2xl font-bold text-hive-dark">Meetings</Text>}
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setShowScheduler(true)}
              className="bg-charcoal px-4 py-2 rounded-lg active:bg-charcoal/80"
            >
              <Text className="text-white font-semibold">Schedule</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowRecorder(true)}
              className="bg-honey-500 px-4 py-2 rounded-lg active:bg-honey-600"
            >
              <Text className="text-white font-semibold">Record</Text>
            </Pressable>
          </View>
        </View>

        {/* Upcoming Meetings */}
        {upcomingMeetings.length > 0 && (
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
        )}

        {/* Past Meetings Header */}
        <Text className="text-lg font-semibold text-gray-800 mb-3">
          Past Recordings
        </Text>

        {/* Meeting List */}
        {meetings.length === 0 ? (
          <View className="bg-white rounded-xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-4">📝</Text>
            <Text className="text-gray-600 text-center">
              No meetings recorded yet.{'\n'}
              Tap Record to capture your next Hive gathering.
            </Text>
          </View>
        ) : (
          meetings.map((meeting) => (
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
                    Meeting on {formatDateLong(meeting.date)}
                  </Text>
                  <Text className="text-sm text-gray-500 mt-1">
                    Status:{' '}
                    <Text
                      className={
                        meeting.processing_status === 'complete'
                          ? 'text-green-600'
                          : meeting.processing_status === 'failed'
                          ? 'text-red-600'
                          : 'text-honey-600'
                      }
                    >
                      {meeting.processing_status}
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
          ))
        )}
      </ScrollView>

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
        onRequestClose={() => setEditingEvent(null)}
      >
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
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

            <View className="flex-row gap-4 mb-4">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 mb-1">Date</Text>
                <TextInput
                  value={editForm.event_date}
                  onChangeText={(text) => setEditForm((f) => ({ ...f, event_date: text }))}
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 mb-1">Time</Text>
                <TextInput
                  value={editForm.event_time}
                  onChangeText={(text) => setEditForm((f) => ({ ...f, event_time: text }))}
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="HH:MM (24hr)"
                />
              </View>
            </View>

            {editingEvent?.meet_link && (
              <View className="bg-gray-50 rounded-lg p-4 mt-4">
                <Text className="text-sm text-gray-600">
                  📹 This meeting has a Google Meet link attached
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

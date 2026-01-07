import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { AudioRecorder } from '../../components/meetings/AudioRecorder';
import { MeetingSummary } from '../../components/meetings/MeetingSummary';
import type { Meeting } from '../../types';

export default function MeetingsScreen() {
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const fetchMeetings = useCallback(async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .order('date', { ascending: false })
      .limit(20);

    if (!error && data) {
      setMeetings(data);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMeetings();
    setRefreshing(false);
  };

  const handleRecordingComplete = async (audioPath: string) => {
    try {
      // Create meeting record
      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          date: new Date().toISOString().split('T')[0],
          audio_url: audioPath,
          recorded_by: profile?.id,
          processing_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      setShowRecorder(false);
      await fetchMeetings();
      Alert.alert(
        'Meeting Recorded',
        'Your meeting has been saved and will be transcribed shortly.'
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
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl font-bold text-hive-dark">Meetings 🎙️</Text>
          <Pressable
            onPress={() => setShowRecorder(true)}
            className="bg-honey-500 px-4 py-2 rounded-lg active:bg-honey-600"
          >
            <Text className="text-white font-semibold">Record</Text>
          </Pressable>
        </View>

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
            <Pressable
              key={meeting.id}
              onPress={() => setSelectedMeeting(meeting)}
              className="bg-white rounded-xl p-4 mb-3 shadow-sm active:bg-gray-50"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-semibold text-gray-800">
                    Meeting on{' '}
                    {new Date(meeting.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
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
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { supabase } from '../../lib/supabase';
import type { Meeting, ActionItem, Profile } from '../../types';

interface MeetingSummaryProps {
  meeting: Meeting;
  onBack: () => void;
}

export function MeetingSummary({ meeting, onBack }: MeetingSummaryProps) {
  const [actionItems, setActionItems] = useState<(ActionItem & { assigned_user?: Profile })[]>([]);

  useEffect(() => {
    loadActionItems();
  }, [meeting.id]);

  const loadActionItems = async () => {
    const { data } = await supabase
      .from('action_items')
      .select('*, assigned_user:profiles(*)')
      .eq('meeting_id', meeting.id)
      .order('due_date', { ascending: true });

    if (data) {
      setActionItems(data as (ActionItem & { assigned_user?: Profile })[]);
    }
  };

  const toggleComplete = async (item: ActionItem) => {
    const newCompleted = !item.completed;
    const { error } = await supabase
      .from('action_items')
      .update({
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
      })
      .eq('id', item.id);

    if (!error) {
      setActionItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : undefined }
            : i
        )
      );
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-gray-200">
        <Pressable onPress={onBack} className="mr-4">
          <Text className="text-2xl">←</Text>
        </Pressable>
        <View>
          <Text className="text-xl font-bold text-hive-dark">
            Meeting Summary
          </Text>
          <Text className="text-gray-500">
            {new Date(meeting.date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {/* Status */}
        {meeting.processing_status !== 'complete' && (
          <View
            className={`p-4 rounded-xl mb-4 ${
              meeting.processing_status === 'failed'
                ? 'bg-red-50'
                : 'bg-honey-50'
            }`}
          >
            <Text
              className={`font-medium ${
                meeting.processing_status === 'failed'
                  ? 'text-red-700'
                  : 'text-honey-700'
              }`}
            >
              {meeting.processing_status === 'pending'
                ? 'Waiting to be processed...'
                : meeting.processing_status === 'transcribing'
                ? 'Transcription in progress...'
                : meeting.processing_status === 'summarizing'
                ? 'Generating summary...'
                : 'Processing failed. Please try again.'}
            </Text>
          </View>
        )}

        {/* Summary */}
        {meeting.summary && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Summary
            </Text>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6">{meeting.summary}</Text>
            </View>
          </View>
        )}

        {/* Action Items */}
        {actionItems.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Action Items ({actionItems.filter((i) => !i.completed).length} remaining)
            </Text>
            <View className="bg-gray-50 rounded-xl overflow-hidden">
              {actionItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => toggleComplete(item)}
                  className={`flex-row items-center p-4 border-b border-gray-200 last:border-b-0 ${
                    item.completed ? 'opacity-60' : ''
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                      item.completed
                        ? 'bg-honey-500 border-honey-500'
                        : 'border-gray-400'
                    }`}
                  >
                    {item.completed && (
                      <Text className="text-white text-xs">✓</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`text-gray-800 ${
                        item.completed ? 'line-through' : ''
                      }`}
                    >
                      {item.description}
                    </Text>
                    {item.assigned_user && (
                      <Text className="text-sm text-gray-500 mt-1">
                        Assigned to: {item.assigned_user.name}
                      </Text>
                    )}
                    {item.due_date && (
                      <Text className="text-sm text-gray-500">
                        Due:{' '}
                        {new Date(item.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Transcript */}
        {meeting.transcript_attributed && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Transcript
            </Text>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6 text-sm">
                {meeting.transcript_attributed}
              </Text>
            </View>
          </View>
        )}

        {/* No content yet */}
        {!meeting.summary && !meeting.transcript_attributed && meeting.processing_status === 'complete' && (
          <View className="items-center py-8">
            <Text className="text-4xl mb-4">📝</Text>
            <Text className="text-gray-500 text-center">
              No content available for this meeting.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

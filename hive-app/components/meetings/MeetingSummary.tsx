import { useState, useEffect, useMemo } from 'react';
import { Alert, View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { formatDateLong, formatDateShort } from '../../lib/dateUtils';
import type { Meeting, ActionItem, Profile } from '../../types';

interface MeetingSummaryProps {
  meeting: Meeting;
  onBack: () => void;
  onMeetingUpdated?: (meeting: Meeting) => void;
}

interface ParsedSummary {
  title?: string;
  source?: string;
  import_status?: 'pending' | 'applied';
  applied_at?: string;
  summary?: string;
  decisions?: string[];
  details?: string[];
  wishes_surfaced?: { person_name: string; description: string }[];
  queen_bee_highlights?: string[];
  board_suggestions?: {
    person_name?: string | null;
    title: string;
    content: string;
    category_hint?: string | null;
  }[];
  board_posts_created?: {
    id: string;
    title: string;
    category_id?: string;
  }[];
  hd_boards_created?: { category_id: string; person_name?: string; goal_title?: string }[];
  action_items_created?: number;
  events_created?: number;
}

const normalizeHiveBrandText = (text?: string | null) => (text ?? '').replace(/\bHive\b/g, 'HIVE');

export function MeetingSummary({ meeting: initialMeeting, onBack, onMeetingUpdated }: MeetingSummaryProps) {
  const { communityId } = useAuth();
  const [meeting, setMeeting] = useState(initialMeeting);
  const [actionItems, setActionItems] = useState<(ActionItem & { assigned_user?: Profile })[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [showAttributionModal, setShowAttributionModal] = useState(false);
  const [speakerAssignments, setSpeakerAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [applyingNotes, setApplyingNotes] = useState(false);

  // Extract unique speakers from transcript
  const speakers = useMemo(() => {
    if (!meeting.transcript_raw) return [];
    const speakerRegex = /Speaker ([A-Z]):/g;
    const found = new Set<string>();
    let match;
    while ((match = speakerRegex.exec(meeting.transcript_raw)) !== null) {
      found.add(match[1]);
    }
    return Array.from(found).sort();
  }, [meeting.transcript_raw]);

  // Check if attribution has been done (transcript_attributed differs from transcript_raw)
  const hasAttribution = meeting.transcript_attributed &&
    meeting.transcript_attributed !== meeting.transcript_raw &&
    !meeting.transcript_attributed.includes('Speaker A:');

  useEffect(() => {
    loadActionItems();
    loadMembers();
  }, [meeting.id]);

  const loadMembers = async () => {
    if (!communityId) return;

    const { data: memberRows } = await supabase
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', communityId);

    if (memberRows && memberRows.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', memberRows.map(m => m.user_id))
        .order('name');

      if (profiles) {
        setMembers(profiles);
      }
    }
  };

  // Parse the summary - it might be JSON or plain text
  const parseSummary = (summaryText: string | undefined): ParsedSummary => {
    if (!summaryText) return {};

    let text = summaryText.trim();

    // Strip markdown code blocks if present
    text = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
    text = text.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');

    // Try to parse as JSON
    try {
      let parsed = JSON.parse(text);

      // Handle double-encoded JSON (string inside string)
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // It was just a string, not double-encoded
          return { summary: parsed };
        }
      }

      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // Not JSON, treat as plain text
    }

    // Return as plain summary text
    return { summary: text };
  };

  const parsedSummary = parseSummary(meeting.summary);
  const isImportedNotes = Boolean(parsedSummary.source?.includes('notes') || parsedSummary.source?.includes('upload'));
  const sourceNotesLabel = isImportedNotes ? 'Imported Notes' : 'Transcript';
  const notesNeedApplying = parsedSummary.import_status === 'pending';

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

  const reloadMeeting = async () => {
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meeting.id)
      .single();

    if (data) {
      setMeeting(data as Meeting);
      onMeetingUpdated?.(data as Meeting);
    }

    return data as Meeting | null;
  };

  const applyNotes = async () => {
    if (applyingNotes) return;

    setApplyingNotes(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-meeting-notes', {
        body: { meetingId: meeting.id },
      });

      if (error) throw error;

      if (data?.meeting) {
        setMeeting(data.meeting as Meeting);
        onMeetingUpdated?.(data.meeting as Meeting);
      } else {
        await reloadMeeting();
      }

      await loadActionItems();

      const actionCount = data?.action_items_created ?? 0;
      const eventCount = data?.events_created ?? 0;
      const hdBoardCount = data?.hd_boards_created ?? 0;
      const boardPostCount = data?.board_posts_created ?? 0;

      Alert.alert(
        'Notes Applied',
        `Created ${actionCount} action item${actionCount === 1 ? '' : 's'}, ${eventCount} event${eventCount === 1 ? '' : 's'}, ${hdBoardCount} HD board${hdBoardCount === 1 ? '' : 's'}, and ${boardPostCount} board post${boardPostCount === 1 ? '' : 's'}.`
      );
    } catch (error) {
      console.error('Error applying meeting notes:', error);
      Alert.alert('Apply Failed', 'Clive could not apply those notes yet. Please try again.');
    } finally {
      setApplyingNotes(false);
    }
  };

  const saveAttribution = async () => {
    if (!meeting.transcript_raw) return;

    setSaving(true);
    try {
      // Replace speaker labels with names
      let attributed = meeting.transcript_raw;
      for (const speaker of speakers) {
        const memberId = speakerAssignments[speaker];
        if (memberId) {
          const member = members.find(m => m.id === memberId);
          if (member) {
            const regex = new RegExp(`Speaker ${speaker}:`, 'g');
            attributed = attributed.replace(regex, `${member.name}:`);
          }
        }
      }

      const { error } = await supabase
        .from('meetings')
        .update({ transcript_attributed: attributed })
        .eq('id', meeting.id);

      if (!error) {
        setMeeting(prev => ({ ...prev, transcript_attributed: attributed }));
        setShowAttributionModal(false);
      }
    } finally {
      setSaving(false);
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
            {normalizeHiveBrandText(parsedSummary.title) || 'Meeting Summary'}
          </Text>
          <Text className="text-gray-500">
            {formatDateLong(meeting.date)}
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

        {/* Apply imported notes */}
        {isImportedNotes && (
          <View className="mb-6">
            {notesNeedApplying ? (
              <View className="bg-honey-50 border border-honey-200 rounded-xl p-4">
                <Text className="text-honey-900 font-semibold">
                  Notes imported
                </Text>
                <Text className="text-honey-800 mt-1">
                  Apply them when you are ready to create action items, calendar events, and board posts.
                </Text>
                <Pressable
                  onPress={applyNotes}
                  disabled={applyingNotes}
                  className={`mt-4 bg-honey-500 px-4 py-3 rounded-lg self-start active:bg-honey-600 ${applyingNotes ? 'opacity-60' : ''}`}
                >
                  <Text className="text-white font-semibold">
                    {applyingNotes ? 'Applying...' : 'Apply Notes'}
                  </Text>
                </Pressable>
              </View>
            ) : parsedSummary.import_status === 'applied' ? (
              <View className="bg-green-50 border border-green-100 rounded-xl p-4">
                <Text className="text-green-800 font-semibold">Applied to HIVE</Text>
                <Text className="text-green-700 mt-1">
                  {parsedSummary.action_items_created ?? 0} action item{(parsedSummary.action_items_created ?? 0) === 1 ? '' : 's'} · {parsedSummary.events_created ?? 0} event{(parsedSummary.events_created ?? 0) === 1 ? '' : 's'} · {parsedSummary.hd_boards_created?.length ?? 0} HD board{(parsedSummary.hd_boards_created?.length ?? 0) === 1 ? '' : 's'} · {parsedSummary.board_posts_created?.length ?? 0} board post{(parsedSummary.board_posts_created?.length ?? 0) === 1 ? '' : 's'}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Summary */}
        {parsedSummary.summary && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Summary
            </Text>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6">{parsedSummary.summary}</Text>
            </View>
          </View>
        )}

        {/* Decisions */}
        {parsedSummary.decisions && parsedSummary.decisions.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Decisions
            </Text>
            <View className="bg-gray-50 rounded-xl p-4">
              {parsedSummary.decisions.map((decision, index) => (
                <View key={index} className="flex-row mb-2 last:mb-0">
                  <Text className="text-honey-600 mr-2">•</Text>
                  <Text className="text-gray-700 flex-1">{decision}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Wishes Surfaced */}
        {parsedSummary.wishes_surfaced && parsedSummary.wishes_surfaced.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Wishes Surfaced
            </Text>
            <View className="bg-honey-50 rounded-xl p-4">
              {parsedSummary.wishes_surfaced.map((wish, index) => (
                <View key={index} className={index > 0 ? 'mt-3 pt-3 border-t border-honey-200' : ''}>
                  <Text className="font-medium text-honey-800">{wish.person_name}</Text>
                  <Text className="text-gray-700 mt-1">{wish.description}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Queen Bee Highlights */}
        {parsedSummary.queen_bee_highlights && parsedSummary.queen_bee_highlights.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Queen Bee Highlights
            </Text>
            <View className="bg-purple-50 rounded-xl p-4">
              {parsedSummary.queen_bee_highlights.map((highlight, index) => (
                <View key={index} className="flex-row mb-2 last:mb-0">
                  <Text className="text-purple-600 mr-2">•</Text>
                  <Text className="text-gray-700 flex-1">{highlight}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Suggested Board Updates */}
        {parsedSummary.board_suggestions && parsedSummary.board_suggestions.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Suggested Board Updates
            </Text>
            <View className="bg-honey-50 rounded-xl p-4">
              {parsedSummary.board_suggestions.map((suggestion, index) => (
                <View key={index} className={index > 0 ? 'mt-4 pt-4 border-t border-honey-200' : ''}>
                  <Text className="font-medium text-honey-800">{suggestion.title}</Text>
                  {(suggestion.person_name || suggestion.category_hint) && (
                    <Text className="text-xs text-honey-700 mt-1">
                      {[suggestion.person_name, suggestion.category_hint].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <Text className="text-gray-700 mt-2">{suggestion.content}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Details */}
        {parsedSummary.details && parsedSummary.details.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Details
            </Text>
            <View className="bg-gray-50 rounded-xl p-4">
              {parsedSummary.details.map((detail, index) => (
                <View key={index} className="flex-row mb-2 last:mb-0">
                  <Text className="text-gray-500 mr-2">•</Text>
                  <Text className="text-gray-700 flex-1">{detail}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Created Board Posts */}
        {parsedSummary.board_posts_created && parsedSummary.board_posts_created.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Board Posts Created
            </Text>
            <View className="bg-gray-50 rounded-xl p-4">
              {parsedSummary.board_posts_created.map((post) => (
                <Text key={post.id} className="text-gray-700 mb-2 last:mb-0">
                  {post.title}
                </Text>
              ))}
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
                        Due: {formatDateShort(item.due_date)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Transcript */}
        {(meeting.transcript_attributed || meeting.transcript_raw) && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-lg font-semibold text-gray-700">
                {sourceNotesLabel}
              </Text>
              {speakers.length > 0 && !hasAttribution && (
                <Pressable
                  onPress={() => setShowAttributionModal(true)}
                  className="bg-honey-500 px-3 py-1 rounded-lg"
                >
                  <Text className="text-white text-sm font-medium">Assign Speakers</Text>
                </Pressable>
              )}
            </View>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6 text-sm">
                {meeting.transcript_attributed || meeting.transcript_raw}
              </Text>
            </View>
          </View>
        )}

        {/* No content yet */}
        {!parsedSummary.summary && !meeting.transcript_attributed && !meeting.transcript_raw && meeting.processing_status === 'complete' && (
          <View className="items-center py-8">
            <Text className="text-4xl mb-4">📝</Text>
            <Text className="text-gray-500 text-center">
              No content available for this meeting.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Speaker Attribution Modal */}
      <Modal
        visible={showAttributionModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAttributionModal(false)}
      >
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Pressable onPress={() => setShowAttributionModal(false)}>
              <Text className="text-gray-500 text-base">Cancel</Text>
            </Pressable>
            <Text className="text-lg font-bold text-hive-dark">Assign Speakers</Text>
            <Pressable
              onPress={saveAttribution}
              disabled={saving || Object.keys(speakerAssignments).length === 0}
              className={saving ? 'opacity-50' : ''}
            >
              <Text className="text-honey-600 text-base font-semibold">
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4">
            <Text className="text-gray-600 mb-4">
              Assign each speaker label to a community member. The transcript will be updated with their names.
            </Text>

            {speakers.map((speaker) => (
              <View key={speaker} className="mb-4">
                <Text className="font-medium text-gray-700 mb-2">
                  Speaker {speaker}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {members.map((member) => (
                    <Pressable
                      key={member.id}
                      onPress={() => setSpeakerAssignments(prev => ({
                        ...prev,
                        [speaker]: prev[speaker] === member.id ? '' : member.id
                      }))}
                      className={`px-3 py-2 rounded-lg border ${
                        speakerAssignments[speaker] === member.id
                          ? 'bg-honey-500 border-honey-500'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      <Text
                        className={
                          speakerAssignments[speaker] === member.id
                            ? 'text-white font-medium'
                            : 'text-gray-700'
                        }
                      >
                        {member.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            {/* Preview */}
            {Object.keys(speakerAssignments).length > 0 && (
              <View className="mt-6 p-4 bg-gray-50 rounded-xl">
                <Text className="font-medium text-gray-700 mb-2">Preview:</Text>
                {speakers.map((speaker) => {
                  const memberId = speakerAssignments[speaker];
                  const member = members.find(m => m.id === memberId);
                  return (
                    <Text key={speaker} className="text-gray-600">
                      Speaker {speaker} → {member?.name || '(not assigned)'}
                    </Text>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

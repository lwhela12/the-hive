import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { supabase } from '../../lib/supabase';
import { formatDateLong, formatDateShort } from '../../lib/dateUtils';
import { SummarySections } from './SummarySections';
import type { Meeting, ActionItem, Profile } from '../../types';

interface MeetingSummaryProps {
  meeting: Meeting;
  onBack: () => void;
  onMeetingUpdated?: (meeting: Meeting) => void;
}

/**
 * What happened at a meeting.
 *
 * This used to double as a notes-ingestion workbench: import a transcript, have
 * Clive propose action items and board posts, tick the ones to keep, map speaker
 * labels to names. All of it is gone (Nat 2026-07-25). Working out who said what
 * in a recording was never reliable enough to trust, and the deck now writes the
 * meeting record as the night happens — so there's nothing left to ingest.
 * Summaries only.
 *
 * `sections` is the modern shape; everything below it is how older meetings were
 * saved and stays for them.
 */
interface ParsedSummary {
  title?: string;
  summary?: string;
  decisions?: string[];
  /** The meeting deck in outline form — same running order as the helper. */
  sections?: { title: string; lines: string[] }[];
  details?: string[];
  wishes_surfaced?: { person_name: string; description: string }[];
}

const normalizeHiveBrandText = (text?: string | null) => (text ?? '').replace(/\bHive\b/g, 'HIVE');

export function MeetingSummary({ meeting, onBack }: MeetingSummaryProps) {
  const [actionItems, setActionItems] = useState<(ActionItem & { assigned_user?: Profile })[]>([]);

  useEffect(() => {
    const loadActionItems = async () => {
      const { data } = await supabase
        .from('action_items')
        .select('*, assigned_user:profiles(*)')
        .eq('meeting_id', meeting.id)
        .order('due_date', { ascending: true });

      if (data) setActionItems(data as (ActionItem & { assigned_user?: Profile })[]);
    };
    void loadActionItems();
  }, [meeting.id]);

  // The summary column holds JSON these days, but older rows are plain text and
  // a few were double-encoded. Fall back rather than showing nothing.
  const parseSummary = (summaryText: string | undefined): ParsedSummary => {
    if (!summaryText) return {};

    let text = summaryText.trim();
    text = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
    text = text.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');

    try {
      let parsed = JSON.parse(text);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          return { summary: parsed };
        }
      }
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {
      // Not JSON — treat the whole thing as the summary text.
    }

    return { summary: text };
  };

  const parsedSummary = parseSummary(meeting.summary);
  const isLegacy = !parsedSummary.sections?.length;

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

  const hasAnything = Boolean(
    parsedSummary.sections?.length
    || parsedSummary.summary
    || parsedSummary.decisions?.length
    || parsedSummary.details?.length
    || actionItems.length
  );

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center p-4 border-b border-gray-200">
        <Pressable onPress={onBack} className="mr-4">
          <Text className="text-2xl">←</Text>
        </Pressable>
        <View>
          <Text className="text-xl font-bold text-hive-dark">
            {normalizeHiveBrandText(parsedSummary.title) || 'Meeting Summary'}
          </Text>
          <Text className="text-label">{formatDateLong(meeting.date)}</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {meeting.processing_status === 'failed' && (
          <View className="p-4 rounded-xl mb-4 bg-red-50">
            <Text className="font-medium text-red-700">
              Something went wrong writing this summary.
            </Text>
          </View>
        )}

        {/* The deck in outline — same renderer the newsletter draft uses. */}
        {parsedSummary.sections && parsedSummary.sections.length > 0 && (
          <View className="mb-6">
            <SummarySections sections={parsedSummary.sections} />
          </View>
        )}

        {isLegacy && parsedSummary.summary && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Summary</Text>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6">{parsedSummary.summary}</Text>
            </View>
          </View>
        )}

        {isLegacy && parsedSummary.decisions && parsedSummary.decisions.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Decisions</Text>
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

        {isLegacy && parsedSummary.wishes_surfaced && parsedSummary.wishes_surfaced.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Wishes Surfaced</Text>
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

        {isLegacy && parsedSummary.details && parsedSummary.details.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Details</Text>
            <View className="bg-gray-50 rounded-xl p-4">
              {parsedSummary.details.map((detail, index) => (
                <View key={index} className="flex-row mb-2 last:mb-0">
                  <Text className="text-label mr-2">•</Text>
                  <Text className="text-gray-700 flex-1">{detail}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

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
                      item.completed ? 'bg-honey-500 border-honey-500' : 'border-gray-400'
                    }`}
                  >
                    {item.completed && <Text className="text-white text-xs">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className={`text-gray-800 ${item.completed ? 'line-through' : ''}`}>
                      {item.description}
                    </Text>
                    {item.assigned_user && (
                      <Text className="text-sm text-label mt-1">
                        Assigned to: {item.assigned_user.name}
                      </Text>
                    )}
                    {item.due_date && (
                      <Text className="text-sm text-label">Due: {formatDateShort(item.due_date)}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!hasAnything && (
          <View className="items-center py-8">
            <Text className="text-4xl mb-4">📝</Text>
            <Text className="text-label text-center">
              No summary was written for this meeting.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

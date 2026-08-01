import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
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
 * What happened at a meeting — and, when the meeting arrived as imported notes,
 * what Clive proposes making of it.
 *
 * Two ways in, and a HIVE can use either or both (Nat 2026-08-01):
 *
 *   A. Record or import notes → preview → tick what to keep → apply.
 *   B. Run the deck live in the Meeting Helper, which writes the record as the
 *      night happens. Nothing to review; the summary is already the summary.
 *
 * OG HIVE meets in person and lives on (B), which is why (A) was pulled out on
 * 2026-07-25. Tech HIVE and Show HIVE meet on Google Meet, where a transcript
 * is a real artifact, so (A) is back — minus the two pieces that never earned
 * their keep: raw transcript blocks and speaker attribution. Working out who
 * said what in a recording was never reliable enough to trust.
 *
 * `sections` is the modern shape; everything below it is how older meetings were
 * saved and stays for them.
 */
interface ProposedActionItem {
  description: string;
  assigned_to_name?: string | null;
  due_date?: string | null;
}

interface ProposedEvent {
  title: string;
  description?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  location?: string | null;
}

interface ProposedBoardPost {
  title: string;
  content?: string | null;
  category_name?: string | null;
}

interface ParsedSummary {
  title?: string;
  summary?: string;
  decisions?: string[];
  /** The meeting deck in outline form — same running order as the helper. */
  sections?: { title: string; lines: string[] }[];
  details?: string[];
  wishes_surfaced?: { person_name: string; description: string }[];
  /** Set only when this meeting came in as notes rather than a live deck. */
  import_status?: 'pending' | 'preview' | 'applied' | 'live';
  preview_generated_at?: string;
  action_items?: ProposedActionItem[];
  events?: ProposedEvent[];
  board_suggestions?: ProposedBoardPost[];
}

// HD boards used to be proposed here too. They're gone everywhere now
// (migration 122), so nothing offers to make one.
type PreviewSelectionKey = 'action_item_indices' | 'event_indices' | 'board_suggestion_indices';
type PreviewSelection = Record<PreviewSelectionKey, number[]>;

const EMPTY_PREVIEW_SELECTION: PreviewSelection = {
  action_item_indices: [],
  event_indices: [],
  board_suggestion_indices: [],
};

const normalizeHiveBrandText = (text?: string | null) => (text ?? '').replace(/\bHive\b/g, 'HIVE');

const everythingSelected = (summary: ParsedSummary): PreviewSelection => ({
  action_item_indices: (summary.action_items ?? []).map((_, index) => index),
  event_indices: (summary.events ?? []).map((_, index) => index),
  board_suggestion_indices: (summary.board_suggestions ?? []).map((_, index) => index),
});

const countSelection = (selection: PreviewSelection) =>
  selection.action_item_indices.length
  + selection.event_indices.length
  + selection.board_suggestion_indices.length;

const countProposals = (summary: ParsedSummary) =>
  (summary.action_items?.length ?? 0)
  + (summary.events?.length ?? 0)
  + (summary.board_suggestions?.length ?? 0);

const joinMeta = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

function PreviewReviewSection<T>({
  title,
  items,
  selectionKey,
  selection,
  onToggle,
  renderTitle,
  renderMeta,
  renderBody,
}: {
  title: string;
  items: T[];
  selectionKey: PreviewSelectionKey;
  selection: PreviewSelection;
  onToggle: (key: PreviewSelectionKey, index: number) => void;
  renderTitle: (item: T) => string;
  renderMeta?: (item: T) => string | null | undefined;
  renderBody?: (item: T) => ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <View className="mt-4">
      <Text className="text-sm font-semibold text-gray-700 mb-2">
        {title} ({items.length})
      </Text>
      <View className="bg-white rounded-xl overflow-hidden border border-honey-100">
        {items.map((item, index) => {
          const selected = selection[selectionKey].includes(index);
          return (
            <Pressable
              key={`${selectionKey}-${index}`}
              onPress={() => onToggle(selectionKey, index)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              className={`flex-row items-start p-4 active:bg-honey-50 ${index > 0 ? 'border-t border-honey-100' : ''}`}
            >
              <View
                className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                  selected ? 'bg-honey-500 border-honey-500' : 'border-gray-300'
                }`}
              >
                {selected && <Text className="text-white text-xs">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="font-medium text-gray-800">{renderTitle(item)}</Text>
                {renderMeta?.(item) ? (
                  <Text className="text-xs text-honey-700 mt-1">{renderMeta(item)}</Text>
                ) : null}
                {renderBody?.(item)}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MeetingSummary({ meeting: initialMeeting, onBack, onMeetingUpdated }: MeetingSummaryProps) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [actionItems, setActionItems] = useState<(ActionItem & { assigned_user?: Profile })[]>([]);
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection>(EMPTY_PREVIEW_SELECTION);
  const [previewSelectionSource, setPreviewSelectionSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMeeting(initialMeeting); }, [initialMeeting]);

  const loadActionItems = useCallback(async () => {
    const { data } = await supabase
      .from('action_items')
      .select('*, assigned_user:profiles(*)')
      .eq('meeting_id', meeting.id)
      .order('due_date', { ascending: true });

    if (data) setActionItems(data as (ActionItem & { assigned_user?: Profile })[]);
  }, [meeting.id]);

  useEffect(() => { void loadActionItems(); }, [loadActionItems]);

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

  const importStatus = parsedSummary.import_status;
  // A live deck writes its own record — there is nothing to review.
  const cameFromNotes = importStatus === 'pending' || importStatus === 'preview' || importStatus === 'applied';
  const notesNeedPreview = importStatus === 'pending';
  const notesHavePreview = importStatus === 'preview';
  const proposalCount = countProposals(parsedSummary);
  const selectedCount = countSelection(previewSelection);

  // A fresh preview replaces whatever was ticked before it.
  const selectionSource = notesHavePreview
    ? `${meeting.id}:${parsedSummary.preview_generated_at ?? 'preview'}`
    : null;

  useEffect(() => {
    if (selectionSource && selectionSource !== previewSelectionSource) {
      setPreviewSelection(everythingSelected(parsedSummary));
      setPreviewSelectionSource(selectionSource);
    } else if (!selectionSource && previewSelectionSource) {
      setPreviewSelection(EMPTY_PREVIEW_SELECTION);
      setPreviewSelectionSource(null);
    }
  }, [selectionSource, previewSelectionSource, parsedSummary]);

  const togglePreviewItem = (key: PreviewSelectionKey, index: number) => {
    setPreviewSelection((current) => {
      const chosen = current[key];
      return {
        ...current,
        [key]: chosen.includes(index) ? chosen.filter((i) => i !== index) : [...chosen, index],
      };
    });
  };

  const reloadMeeting = async () => {
    const { data } = await supabase.from('meetings').select('*').eq('id', meeting.id).single();
    if (data) {
      setMeeting(data as Meeting);
      onMeetingUpdated?.(data as Meeting);
    }
  };

  const previewNotes = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-meeting-notes', {
        body: { meetingId: meeting.id, mode: 'preview' },
      });
      if (error) throw error;

      if (data?.meeting) {
        setMeeting(data.meeting as Meeting);
        onMeetingUpdated?.(data.meeting as Meeting);
      } else {
        await reloadMeeting();
      }

      const total = data?.preview_counts?.total ?? 0;
      Alert.alert(
        'Preview ready',
        `Clive found ${total} proposed update${total === 1 ? '' : 's'} to look over before anything is created.`
      );
    } catch (error) {
      console.error('Error previewing meeting notes:', error);
      Alert.alert('Preview failed', 'Clive could not read those notes just now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const applyApprovedNotes = async () => {
    if (busy) return;
    if (selectedCount === 0) {
      Alert.alert('Nothing ticked', 'Choose at least one proposed update to create.');
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-meeting-notes', {
        body: {
          meetingId: meeting.id,
          mode: 'apply',
          // hd_board_indices stays empty on purpose — HD boards are retired.
          selection: { ...previewSelection, hd_board_indices: [] },
        },
      });
      if (error) throw error;

      if (data?.meeting) {
        setMeeting(data.meeting as Meeting);
        onMeetingUpdated?.(data.meeting as Meeting);
      } else {
        await reloadMeeting();
      }

      await loadActionItems();

      const made = [
        `${data?.action_items_created ?? 0} action item${(data?.action_items_created ?? 0) === 1 ? '' : 's'}`,
        `${data?.events_created ?? 0} event${(data?.events_created ?? 0) === 1 ? '' : 's'}`,
        `${data?.board_posts_created ?? 0} board post${(data?.board_posts_created ?? 0) === 1 ? '' : 's'}`,
      ].join(', ');
      Alert.alert('Notes applied', `Created ${made}.`);
    } catch (error) {
      console.error('Error applying meeting notes:', error);
      Alert.alert('Apply failed', 'Clive could not apply those notes just now. Please try again.');
    } finally {
      setBusy(false);
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

  const hasAnything = Boolean(
    parsedSummary.sections?.length
    || parsedSummary.summary
    || parsedSummary.decisions?.length
    || parsedSummary.details?.length
    || actionItems.length
    || cameFromNotes
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

        {/* Imported notes: look them over, then decide what becomes real. */}
        {notesNeedPreview && (
          <View className="mb-6 bg-honey-50 border border-honey-200 rounded-xl p-4">
            <Text className="text-honey-900 font-semibold">Notes imported</Text>
            <Text className="text-honey-800 mt-1">
              Have Clive read them and propose action items, calendar events and board
              posts. Nothing is created until you say so.
            </Text>
            <Pressable
              onPress={previewNotes}
              disabled={busy}
              className={`mt-4 bg-honey-500 px-4 py-3 rounded-lg self-start active:bg-honey-600 ${busy ? 'opacity-60' : ''}`}
            >
              <Text className="text-white font-semibold">
                {busy ? 'Reading…' : 'Read the notes'}
              </Text>
            </Pressable>
          </View>
        )}

        {notesHavePreview && (
          <View className="mb-6 bg-honey-50 border border-honey-200 rounded-xl p-4">
            <Text className="text-honey-900 font-semibold">What Clive found</Text>
            <Text className="text-honey-800 mt-1">
              {selectedCount} of {proposalCount} ticked. Untick anything you'd rather not create.
            </Text>

            <View className="flex-row flex-wrap gap-2 mt-4">
              <Pressable
                onPress={() => setPreviewSelection(everythingSelected(parsedSummary))}
                className="bg-white border border-honey-200 px-3 py-2 rounded-lg active:bg-honey-100"
              >
                <Text className="text-honey-800 font-semibold text-sm">Tick all</Text>
              </Pressable>
              <Pressable
                onPress={() => setPreviewSelection(EMPTY_PREVIEW_SELECTION)}
                className="bg-white border border-honey-200 px-3 py-2 rounded-lg active:bg-honey-100"
              >
                <Text className="text-honey-800 font-semibold text-sm">Clear</Text>
              </Pressable>
              <Pressable
                onPress={previewNotes}
                disabled={busy}
                className={`bg-white border border-honey-200 px-3 py-2 rounded-lg active:bg-honey-100 ${busy ? 'opacity-60' : ''}`}
              >
                <Text className="text-honey-800 font-semibold text-sm">Read again</Text>
              </Pressable>
            </View>

            <PreviewReviewSection
              title="Action items"
              items={parsedSummary.action_items ?? []}
              selectionKey="action_item_indices"
              selection={previewSelection}
              onToggle={togglePreviewItem}
              renderTitle={(item) => item.description}
              renderMeta={(item) => joinMeta([
                item.assigned_to_name ? `For ${item.assigned_to_name}` : null,
                item.due_date ? `Due ${formatDateShort(item.due_date)}` : null,
              ])}
            />

            <PreviewReviewSection
              title="Calendar events"
              items={parsedSummary.events ?? []}
              selectionKey="event_indices"
              selection={previewSelection}
              onToggle={togglePreviewItem}
              renderTitle={(item) => item.title}
              renderMeta={(item) => joinMeta([
                item.event_date ? formatDateShort(item.event_date) : null,
                item.event_time,
                item.location,
              ])}
              renderBody={(item) => item.description
                ? <Text className="text-gray-700 mt-2">{item.description}</Text>
                : null}
            />

            <PreviewReviewSection
              title="Board posts"
              items={parsedSummary.board_suggestions ?? []}
              selectionKey="board_suggestion_indices"
              selection={previewSelection}
              onToggle={togglePreviewItem}
              renderTitle={(item) => item.title}
              renderMeta={(item) => item.category_name ? `To ${item.category_name}` : null}
              renderBody={(item) => item.content
                ? <Text className="text-gray-700 mt-2">{item.content}</Text>
                : null}
            />

            <Pressable
              onPress={applyApprovedNotes}
              disabled={busy || selectedCount === 0}
              className={`mt-5 bg-honey-500 px-4 py-3 rounded-lg self-start active:bg-honey-600 ${
                busy || selectedCount === 0 ? 'opacity-60' : ''
              }`}
            >
              <Text className="text-white font-semibold">
                {busy ? 'Creating…' : `Create ${selectedCount} item${selectedCount === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
          </View>
        )}

        {importStatus === 'applied' && (
          <View className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <Text className="text-green-800 font-semibold">These notes have been applied.</Text>
            <Text className="text-green-700 mt-1">
              Whatever you ticked is now living in action items, the calendar and the boards.
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

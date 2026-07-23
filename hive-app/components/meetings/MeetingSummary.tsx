import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Alert, View, Text, ScrollView, Pressable, Modal, TextInput } from 'react-native';
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
  import_status?: 'pending' | 'preview' | 'applied' | 'live';
  preview_generated_at?: string;
  applied_at?: string;
  summary?: string;
  decisions?: string[];
  details?: string[];
  action_items?: {
    description: string;
    assigned_to_name?: string | null;
    due_date?: string | null;
  }[];
  events?: {
    title: string;
    event_date: string;
    event_time?: string | null;
    event_type?: 'meeting' | 'custom';
    description?: string | null;
    location?: string | null;
  }[];
  wishes_surfaced?: { person_name: string; description: string }[];
  hd_boards?: {
    person_name: string;
    goal_title: string;
    description?: string | null;
  }[];
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

type PreviewSelectionKey =
  | 'action_item_indices'
  | 'event_indices'
  | 'hd_board_indices'
  | 'board_suggestion_indices';

type PreviewSelection = Record<PreviewSelectionKey, number[]>;

type ProposalEditKind = 'action_items' | 'events' | 'hd_boards' | 'board_suggestions';

interface EditingProposal {
  kind: ProposalEditKind;
  index: number;
  draft: Record<string, string>;
}

const EMPTY_PREVIEW_SELECTION: PreviewSelection = {
  action_item_indices: [],
  event_indices: [],
  hd_board_indices: [],
  board_suggestion_indices: [],
};

const normalizeHiveBrandText = (text?: string | null) => (text ?? '').replace(/\bHive\b/g, 'HIVE');

const getPreviewSelection = (summary: ParsedSummary): PreviewSelection => ({
  action_item_indices: (summary.action_items ?? []).map((_, index) => index),
  event_indices: (summary.events ?? []).map((_, index) => index),
  hd_board_indices: (summary.hd_boards ?? []).map((_, index) => index),
  board_suggestion_indices: (summary.board_suggestions ?? []).map((_, index) => index),
});

const countPreviewSelection = (selection: PreviewSelection) => (
  selection.action_item_indices.length
  + selection.event_indices.length
  + selection.hd_board_indices.length
  + selection.board_suggestion_indices.length
);

const countPreviewItems = (summary: ParsedSummary) => (
  (summary.action_items?.length ?? 0)
  + (summary.events?.length ?? 0)
  + (summary.hd_boards?.length ?? 0)
  + (summary.board_suggestions?.length ?? 0)
);

const isIsoDate = (value?: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const trimToNull = (value?: string | null) => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

function PreviewReviewSection<T>({
  title,
  items,
  selectionKey,
  selection,
  onToggle,
  renderTitle,
  renderMeta,
  renderBody,
  onEdit,
}: {
  title: string;
  items: T[];
  selectionKey: PreviewSelectionKey;
  selection: PreviewSelection;
  onToggle: (key: PreviewSelectionKey, index: number) => void;
  renderTitle: (item: T) => string;
  renderMeta?: (item: T) => string | null | undefined;
  renderBody?: (item: T) => ReactNode;
  onEdit?: (item: T, index: number) => void;
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
            <View
              key={`${selectionKey}-${index}`}
              className={`flex-row items-start p-4 ${index > 0 ? 'border-t border-honey-100' : ''}`}
            >
              <Pressable
                onPress={() => onToggle(selectionKey, index)}
                className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                  selected ? 'bg-honey-500 border-honey-500' : 'border-gray-300'
                }`}
              >
                {selected && <Text className="text-white text-xs">✓</Text>}
              </Pressable>
              <View className="flex-1">
                <Text className="font-medium text-gray-800">
                  {renderTitle(item)}
                </Text>
                {renderMeta?.(item) ? (
                  <Text className="text-xs text-honey-700 mt-1">
                    {renderMeta(item)}
                  </Text>
                ) : null}
                {renderBody?.(item)}
                {onEdit && (
                  <Pressable
                    onPress={() => onEdit(item, index)}
                    className="bg-gray-100 px-3 py-2 rounded-lg active:bg-gray-200 self-start mt-3"
                  >
                    <Text className="text-gray-700 font-semibold text-sm">Edit</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function MeetingSummary({ meeting: initialMeeting, onBack, onMeetingUpdated }: MeetingSummaryProps) {
  const { communityId } = useAuth();
  const [meeting, setMeeting] = useState(initialMeeting);
  const [actionItems, setActionItems] = useState<(ActionItem & { assigned_user?: Profile })[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [showAttributionModal, setShowAttributionModal] = useState(false);
  const [speakerAssignments, setSpeakerAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [applyingNotes, setApplyingNotes] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection>(EMPTY_PREVIEW_SELECTION);
  const [previewSelectionSource, setPreviewSelectionSource] = useState<string | null>(null);
  const [editingProposal, setEditingProposal] = useState<EditingProposal | null>(null);
  const [savingProposalEdit, setSavingProposalEdit] = useState(false);

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
  const notesNeedPreview = parsedSummary.import_status === 'pending';
  const notesHavePreview = parsedSummary.import_status === 'preview';
  const previewItemCount = countPreviewItems(parsedSummary);
  const selectedPreviewCount = countPreviewSelection(previewSelection);
  const currentPreviewSelectionSource = notesHavePreview
    ? `${meeting.id}:${parsedSummary.preview_generated_at ?? 'preview'}`
    : null;

  useEffect(() => {
    if (currentPreviewSelectionSource && currentPreviewSelectionSource !== previewSelectionSource) {
      setPreviewSelection(getPreviewSelection(parsedSummary));
      setPreviewSelectionSource(currentPreviewSelectionSource);
    } else if (!currentPreviewSelectionSource && previewSelectionSource) {
      setPreviewSelection(EMPTY_PREVIEW_SELECTION);
      setPreviewSelectionSource(null);
    }
  }, [currentPreviewSelectionSource, parsedSummary, previewSelectionSource]);

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

  const togglePreviewItem = (key: PreviewSelectionKey, index: number) => {
    setPreviewSelection((current) => {
      const selected = current[key].includes(index);
      return {
        ...current,
        [key]: selected
          ? current[key].filter((selectedIndex) => selectedIndex !== index)
          : [...current[key], index].sort((a, b) => a - b),
      };
    });
  };

  const openProposalEditor = (kind: ProposalEditKind, index: number, item: Record<string, any>) => {
    const draft: Record<string, string> = {};
    Object.entries(item).forEach(([key, value]) => {
      draft[key] = value === null || value === undefined ? '' : String(value);
    });
    setEditingProposal({ kind, index, draft });
  };

  const updateProposalDraft = (field: string, value: string) => {
    setEditingProposal((current) => current
      ? { ...current, draft: { ...current.draft, [field]: value } }
      : current);
  };

  const saveProposalEdit = async () => {
    if (!editingProposal || savingProposalEdit) return;

    const { kind, index, draft } = editingProposal;
    const nextSummary: ParsedSummary = { ...parsedSummary };
    const currentItems = ([...(nextSummary[kind] ?? [])] as Record<string, any>[]);

    if (!currentItems[index]) {
      setEditingProposal(null);
      return;
    }

    if (kind === 'action_items') {
      const description = draft.description?.trim();
      if (!description) {
        Alert.alert('Description Needed', 'Action items need a description.');
        return;
      }
      currentItems[index] = {
        description,
        assigned_to_name: trimToNull(draft.assigned_to_name),
        due_date: isIsoDate(draft.due_date) ? draft.due_date : null,
      };
    } else if (kind === 'events') {
      const title = draft.title?.trim();
      if (!title) {
        Alert.alert('Title Needed', 'Calendar events need a title.');
        return;
      }
      if (draft.event_date?.trim() && !isIsoDate(draft.event_date.trim())) {
        Alert.alert('Date Format', 'Use YYYY-MM-DD for event dates.');
        return;
      }
      currentItems[index] = {
        title,
        event_date: draft.event_date?.trim() || '',
        event_time: trimToNull(draft.event_time),
        event_type: draft.event_type === 'meeting' ? 'meeting' : 'custom',
        description: trimToNull(draft.description),
        location: trimToNull(draft.location),
      };
    } else if (kind === 'hd_boards') {
      const personName = draft.person_name?.trim();
      const goalTitle = draft.goal_title?.trim();
      if (!personName || !goalTitle) {
        Alert.alert('Board Details Needed', 'HD boards need a person and goal title.');
        return;
      }
      currentItems[index] = {
        person_name: personName,
        goal_title: goalTitle,
        description: trimToNull(draft.description),
      };
    } else {
      const title = draft.title?.trim();
      const content = draft.content?.trim();
      if (!title || !content) {
        Alert.alert('Post Details Needed', 'Board posts need a title and content.');
        return;
      }
      currentItems[index] = {
        person_name: trimToNull(draft.person_name),
        title,
        content,
        category_hint: trimToNull(draft.category_hint),
      };
    }

    (nextSummary as any)[kind] = currentItems;
    nextSummary.preview_generated_at = parsedSummary.preview_generated_at ?? new Date().toISOString();

    setSavingProposalEdit(true);
    try {
      const { data, error } = await supabase
        .from('meetings')
        .update({ summary: JSON.stringify(nextSummary) })
        .eq('id', meeting.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMeeting(data as Meeting);
        onMeetingUpdated?.(data as Meeting);
      }
      setEditingProposal(null);
    } catch (error) {
      console.error('Error saving proposal edit:', error);
      Alert.alert('Edit Not Saved', 'Could not save that proposal edit. Please try again.');
    } finally {
      setSavingProposalEdit(false);
    }
  };

  const previewNotes = async () => {
    if (applyingNotes) return;

    setApplyingNotes(true);
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

      const counts = data?.preview_counts ?? {};
      const total = counts.total ?? 0;

      Alert.alert(
        'Preview Ready',
        `Clive found ${total} proposed app update${total === 1 ? '' : 's'} to review before anything is created.`
      );
    } catch (error) {
      console.error('Error previewing meeting notes:', error);
      Alert.alert('Preview Failed', 'Clive could not preview those notes yet. Please try again.');
    } finally {
      setApplyingNotes(false);
    }
  };

  const applyApprovedNotes = async () => {
    if (applyingNotes) return;

    if (selectedPreviewCount === 0) {
      Alert.alert('Nothing Selected', 'Select at least one proposed update to apply.');
      return;
    }

    setApplyingNotes(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-meeting-notes', {
        body: {
          meetingId: meeting.id,
          mode: 'apply',
          selection: previewSelection,
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

  const renderProposalInput = (
    field: string,
    label: string,
    placeholder?: string,
    options: { multiline?: boolean } = {}
  ) => (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      <TextInput
        value={editingProposal?.draft[field] ?? ''}
        onChangeText={(value) => updateProposalDraft(field, value)}
        placeholder={placeholder}
        multiline={options.multiline}
        textAlignVertical={options.multiline ? 'top' : 'center'}
        className="border border-gray-300 rounded-lg px-4 py-3 text-base"
        style={options.multiline ? { minHeight: 120 } : undefined}
      />
    </View>
  );

  const getProposalEditorTitle = () => {
    if (!editingProposal) return 'Edit Proposal';
    if (editingProposal.kind === 'action_items') return 'Edit Action Item';
    if (editingProposal.kind === 'events') return 'Edit Event';
    if (editingProposal.kind === 'hd_boards') return 'Edit HD Board';
    return 'Edit Board Post';
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
          <Text className="text-label">
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
            {notesNeedPreview ? (
              <View className="bg-honey-50 border border-honey-200 rounded-xl p-4">
                <Text className="text-honey-900 font-semibold">
                  Notes imported
                </Text>
                <Text className="text-honey-800 mt-1">
                  Generate a preview to review proposed action items, calendar events, HD boards, and board posts before anything is created.
                </Text>
                <Pressable
                  onPress={previewNotes}
                  disabled={applyingNotes}
                  className={`mt-4 bg-honey-500 px-4 py-3 rounded-lg self-start active:bg-honey-600 ${applyingNotes ? 'opacity-60' : ''}`}
                >
                  <Text className="text-white font-semibold">
                    {applyingNotes ? 'Generating...' : 'Generate Preview'}
                  </Text>
                </Pressable>
              </View>
            ) : notesHavePreview ? (
              <View className="bg-honey-50 border border-honey-200 rounded-xl p-4">
                <Text className="text-honey-900 font-semibold">
                  Review Proposed Updates
                </Text>
                <Text className="text-honey-800 mt-1">
                  {selectedPreviewCount} of {previewItemCount} proposed update{previewItemCount === 1 ? '' : 's'} selected.
                </Text>
                <View className="flex-row flex-wrap gap-2 mt-4">
                  <Pressable
                    onPress={() => setPreviewSelection(getPreviewSelection(parsedSummary))}
                    className="bg-white border border-honey-200 px-3 py-2 rounded-lg active:bg-honey-100"
                  >
                    <Text className="text-honey-800 font-semibold text-sm">Select All</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPreviewSelection(EMPTY_PREVIEW_SELECTION)}
                    className="bg-white border border-honey-200 px-3 py-2 rounded-lg active:bg-honey-100"
                  >
                    <Text className="text-honey-800 font-semibold text-sm">Clear</Text>
                  </Pressable>
                  <Pressable
                    onPress={previewNotes}
                    disabled={applyingNotes}
                    className={`bg-white border border-honey-200 px-3 py-2 rounded-lg active:bg-honey-100 ${applyingNotes ? 'opacity-60' : ''}`}
                  >
                    <Text className="text-honey-800 font-semibold text-sm">Regenerate</Text>
                  </Pressable>
                </View>

                <PreviewReviewSection
                  title="Action Items"
                  items={parsedSummary.action_items ?? []}
                  selectionKey="action_item_indices"
                  selection={previewSelection}
                  onToggle={togglePreviewItem}
                  renderTitle={(item) => item.description}
                  renderMeta={(item) => [
                    item.assigned_to_name ? `Assigned to ${item.assigned_to_name}` : null,
                    item.due_date ? `Due ${formatDateShort(item.due_date)}` : null,
                  ].filter(Boolean).join(' · ')}
                  onEdit={(item, index) => openProposalEditor('action_items', index, item)}
                />

                <PreviewReviewSection
                  title="Calendar Events"
                  items={parsedSummary.events ?? []}
                  selectionKey="event_indices"
                  selection={previewSelection}
                  onToggle={togglePreviewItem}
                  renderTitle={(item) => item.title}
                  renderMeta={(item) => [
                    item.event_date ? formatDateShort(item.event_date) : null,
                    item.event_time ?? null,
                    item.location ?? null,
                  ].filter(Boolean).join(' · ')}
                  renderBody={(item) => item.description ? (
                    <Text className="text-gray-700 mt-2">{item.description}</Text>
                  ) : null}
                  onEdit={(item, index) => openProposalEditor('events', index, item)}
                />

                <PreviewReviewSection
                  title="HD Boards"
                  items={parsedSummary.hd_boards ?? []}
                  selectionKey="hd_board_indices"
                  selection={previewSelection}
                  onToggle={togglePreviewItem}
                  renderTitle={(item) => item.goal_title}
                  renderMeta={(item) => item.person_name}
                  renderBody={(item) => item.description ? (
                    <Text className="text-gray-700 mt-2">{item.description}</Text>
                  ) : null}
                  onEdit={(item, index) => openProposalEditor('hd_boards', index, item)}
                />

                <PreviewReviewSection
                  title="Board Posts"
                  items={parsedSummary.board_suggestions ?? []}
                  selectionKey="board_suggestion_indices"
                  selection={previewSelection}
                  onToggle={togglePreviewItem}
                  renderTitle={(item) => item.title}
                  renderMeta={(item) => [
                    item.person_name ?? null,
                    item.category_hint ?? null,
                  ].filter(Boolean).join(' · ')}
                  renderBody={(item) => (
                    <Text className="text-gray-700 mt-2">{item.content}</Text>
                  )}
                  onEdit={(item, index) => openProposalEditor('board_suggestions', index, item)}
                />

                {previewItemCount === 0 && (
                  <View className="bg-white rounded-xl border border-honey-100 p-4 mt-4">
                    <Text className="text-gray-700">
                      No tasks, events, HD boards, or board posts were proposed from these notes.
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={applyApprovedNotes}
                  disabled={applyingNotes || selectedPreviewCount === 0}
                  className={`mt-4 bg-honey-500 px-4 py-3 rounded-lg self-start active:bg-honey-600 ${
                    applyingNotes || selectedPreviewCount === 0 ? 'opacity-60' : ''
                  }`}
                >
                  <Text className="text-white font-semibold">
                    {applyingNotes ? 'Applying...' : 'Apply Selected'}
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

        {/* Suggested Board Updates */}
        {!notesHavePreview && parsedSummary.board_suggestions && parsedSummary.board_suggestions.length > 0 && (
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
                  <Text className="text-label mr-2">•</Text>
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
                      <Text className="text-sm text-label mt-1">
                        Assigned to: {item.assigned_user.name}
                      </Text>
                    )}
                    {item.due_date && (
                      <Text className="text-sm text-label">
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
            <Text className="text-label text-center">
              No content available for this meeting.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Proposal Edit Modal */}
      <Modal
        visible={!!editingProposal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingProposal(null)}
      >
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Pressable onPress={() => setEditingProposal(null)} disabled={savingProposalEdit}>
              <Text className="text-label text-base">Cancel</Text>
            </Pressable>
            <Text className="text-lg font-bold text-hive-dark">{getProposalEditorTitle()}</Text>
            <Pressable
              onPress={saveProposalEdit}
              disabled={savingProposalEdit}
              className={savingProposalEdit ? 'opacity-50' : ''}
            >
              <Text className="text-honey-600 text-base font-semibold">
                {savingProposalEdit ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
            {editingProposal?.kind === 'action_items' && (
              <>
                {renderProposalInput('description', 'Task', 'What needs to happen?', { multiline: true })}
                {renderProposalInput('assigned_to_name', 'Assigned To', 'Member name or The group')}
                {renderProposalInput('due_date', 'Due Date', 'YYYY-MM-DD')}
              </>
            )}

            {editingProposal?.kind === 'events' && (
              <>
                {renderProposalInput('title', 'Event Title', 'Event title')}
                {renderProposalInput('event_date', 'Date', 'YYYY-MM-DD')}
                {renderProposalInput('event_time', 'Time', 'HH:MM:SS or blank')}
                {renderProposalInput('location', 'Location', 'Optional location')}
                {renderProposalInput('description', 'Description', 'Optional event details', { multiline: true })}
                {renderProposalInput('event_type', 'Type', 'meeting or custom')}
              </>
            )}

            {editingProposal?.kind === 'hd_boards' && (
              <>
                {renderProposalInput('person_name', 'Person', 'Member name')}
                {renderProposalInput('goal_title', 'HD Board Goal', 'Short goal title')}
                {renderProposalInput('description', 'Description', 'What help belongs on this board?', { multiline: true })}
              </>
            )}

            {editingProposal?.kind === 'board_suggestions' && (
              <>
                {renderProposalInput('title', 'Post Title', 'Board post title')}
                {renderProposalInput('person_name', 'Person', 'Optional member name')}
                {renderProposalInput('category_hint', 'Board / Category Hint', 'HD goal, HIVE Approved, 15min HIVE Helpers...')}
                {renderProposalInput('content', 'Post Content', 'What should the board post say?', { multiline: true })}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

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
              <Text className="text-label text-base">Cancel</Text>
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

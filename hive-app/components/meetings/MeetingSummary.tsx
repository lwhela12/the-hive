import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { formatDateLong, formatDateShort } from '../../lib/dateUtils';
import { useAuth } from '../../lib/hooks/useAuth';
import { invalidateWishQueries } from '../../lib/queryClient';
import { desireKey, insightKey, type CaughtInsight } from '../../lib/desires';
import { SummarySections } from './SummarySections';
import {
  SpeakerNames,
  transcriptLineWithNames,
  type SpeakerMember,
  type SpeakerNameMap,
} from './SpeakerNames';
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
 * 2026-07-25. Tech HIVE and Show HIVE talk over a call, where a transcript is a
 * real artifact, so (A) is back.
 *
 * The transcript block came back with it, and so did who-said-what — a machine
 * splitting a recording by voice is reliable, and a machine deciding which
 * voice is Charlee is not. So the split is automatic and the names are a
 * person's to confirm (`SpeakerNames`, migration 188).
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
  sections?: { title: string; lines: string[]; source_label?: string }[];
  provenance?: {
    kind?: 'automatic_activity_record' | 'reviewed_import';
    meeting_date?: string;
    generated_from?: string[];
    transcript_used?: boolean;
    decisions_verified?: boolean;
    check_in_period?: string;
    check_in_response_count?: number;
    community_member_count?: number;
  };
  details?: string[];
  wishes_surfaced?: { person_name: string; description: string }[];
  /**
   * Which of those desires somebody has already turned into a real HD wish.
   *
   * It lives in the meeting's own stored summary rather than in this screen's
   * memory, because a panel that only remembers while it is open tells you a
   * different story every time you come back to it. Keyed by `desireKey()` so
   * the mark survives a re-read of the notes, which renumbers the list.
   */
  desires_added?: Record<string, { wish_id: string; added_at: string; added_for: string }>;
  /** The worth-keeping lines a meeting caught, offered back to their sayers —
   *  same contract as desires (lib/desires.ts). */
  insights_caught?: CaughtInsight[];
  insights_filed?: Record<string, { post_id: string; filed_at: string; filed_by: string }>;
  insights_dismissed?: Record<string, { dismissed_at: string }>;
  /** Set only when this meeting came in as notes rather than a live deck. */
  import_status?: 'pending' | 'preview' | 'applied' | 'live';
  preview_generated_at?: string;
  action_items?: ProposedActionItem[];
  events?: ProposedEvent[];
  board_suggestions?: ProposedBoardPost[];
  /**
   * A human correction wins over the automatic recap everywhere members read
   * it. The generated fields stay beside it, untouched, so fixing a bad recap
   * never destroys the source version.
   */
  manual_correction?: {
    text: string;
    corrected_at: string;
    corrected_by: string;
  };
  manual_correction_history?: {
    text: string;
    corrected_at: string;
    corrected_by: string;
  }[];
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

// One desire's stable name lives in `lib/desires.ts`, shared with the
// profile's wishes panel — the two screens offer the same desire and must
// agree on what it is called, or adding it on one keeps it offered on the
// other.

/** Match the name the meeting used against the people actually in this HIVE. */
const memberCalled = (personName: string, members: SpeakerMember[]) => {
  const wanted = (personName ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!wanted) return null;
  return (
    members.find((member) => (member.name ?? '').toLowerCase().trim() === wanted)
    // A meeting says "Charlee" where the profile says "Charlee Shae". First
    // names are how a room refers to people, so a first-name hit counts.
    ?? members.find((member) => {
      const first = (member.name ?? '').toLowerCase().trim().split(' ')[0];
      return !!first && (first === wanted || wanted.split(' ')[0] === first);
    })
    ?? null
  );
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
  // The transcript starts folded away: the summary is what a person came for,
  // and the exact words are for the night you need them.
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [members, setMembers] = useState<SpeakerMember[]>([]);
  const [addingDesire, setAddingDesire] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  const { profile, communityId, communityRole } = useAuth();

  /**
   * Naming the voices is a HIVE admin's job, and an owner may do it anywhere.
   * The role is held per HIVE, so it only counts when the meeting you are
   * reading belongs to the HIVE you are standing in.
   */
  const isHiveAdmin =
    (communityId === meeting.community_id && communityRole === 'admin')
    || profile?.is_owner === true;

  useEffect(() => { setMeeting(initialMeeting); }, [initialMeeting]);

  // Who is in this HIVE — used twice: to put a name to a voice in the
  // transcript, and to know whose desire is whose.
  useEffect(() => {
    let stale = false;
    const communityIdForMeeting = meeting.community_id;
    if (!communityIdForMeeting) return;

    supabase
      .from('community_memberships')
      .select('user_id, profiles:user_id(id, name)')
      .eq('community_id', communityIdForMeeting)
      .then(({ data, error }) => {
        if (stale || error || !data) return;
        const people = data
          .map((row) => (row as unknown as { profiles?: SpeakerMember | null }).profiles)
          .filter((person): person is SpeakerMember => !!person && !!person.id);
        setMembers(people);
      });

    return () => { stale = true; };
  }, [meeting.community_id]);

  /**
   * Who each voice belongs to (migration 188). Held here rather than read off
   * `meeting` every render so that saving a name repaints the transcript
   * underneath it straight away.
   */
  const speakerNames: SpeakerNameMap = useMemo(() => {
    const stored = (meeting as { speaker_names?: unknown }).speaker_names;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    const names: SpeakerNameMap = {};
    for (const [label, value] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) names[label] = value.trim();
    }
    return names;
  }, [meeting]);

  const loadActionItems = useCallback(async () => {
    const { data } = await supabase
      .from('action_items')
      .select('*, assigned_user:profiles(*)')
      .eq('meeting_id', meeting.id)
      .order('due_date', { ascending: true });

    if (data) setActionItems(data as (ActionItem & { assigned_user?: Profile })[]);
  }, [meeting.id]);

  useEffect(() => { void loadActionItems(); }, [loadActionItems]);

  /**
   * A summary whose summary is the whole answer again.
   *
   * `apply-meeting-notes` writes the model's parsed reply into this column, and
   * a reply that puts its entire JSON body inside its own `summary` string
   * ends up rendered here as source code: Nat, opening August's Production
   * meeting on 2026-08-19, got a page of braces and quotation marks. *"I hate
   * the way this looks."*
   *
   * Fixed at the source too, but this is the reader, and a record already
   * written that way is still on somebody's screen — so unwrap one layer here
   * rather than printing it. The outer object's own fields survive; the inner
   * one wins wherever both speak.
   */
  const unwrapDoubleWrapped = (parsed: Record<string, any>): ParsedSummary => {
    const inner = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!inner.startsWith('{')) return parsed;
    try {
      const nested = JSON.parse(inner);
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return { ...parsed, ...nested };
      }
    } catch {
      // It was simply a summary that happened to start with a brace.
    }
    return parsed;
  };

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
      if (typeof parsed === 'object' && parsed !== null) return unwrapDoubleWrapped(parsed);
    } catch {
      // Not JSON — treat the whole thing as the summary text.
    }

    return { summary: text };
  };

  const parsedSummary = parseSummary(meeting.summary);
  const manualCorrection = parsedSummary.manual_correction?.text?.trim()
    ? parsedSummary.manual_correction
    : null;
  const isLegacy = !parsedSummary.sections?.length;

  /** Turn every old summary shape into one editable, human-readable draft. */
  const automaticSummaryAsText = () => {
    const blocks: string[] = [];

    if (parsedSummary.summary?.trim()) blocks.push(parsedSummary.summary.trim());

    for (const section of parsedSummary.sections ?? []) {
      const lines = (section.lines ?? [])
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `• ${line}`);
      blocks.push([section.title.trim(), ...lines].filter(Boolean).join('\n'));
    }

    if (parsedSummary.decisions?.length) {
      blocks.push(['Decisions', ...parsedSummary.decisions.map((line) => `• ${line.trim()}`)].join('\n'));
    }

    if (parsedSummary.wishes_surfaced?.length) {
      blocks.push([
        'Desires identified',
        ...parsedSummary.wishes_surfaced.map((item) => `• ${item.person_name}: ${item.description}`),
      ].join('\n'));
    }

    if (parsedSummary.insights_caught?.length) {
      blocks.push([
        'Worth keeping',
        ...parsedSummary.insights_caught.map((item) => `• ${item.person_name}: ${item.insight}`),
      ].join('\n'));
    }

    if (parsedSummary.details?.length) {
      blocks.push(['Details', ...parsedSummary.details.map((line) => `• ${line.trim()}`)].join('\n'));
    }

    return blocks.filter(Boolean).join('\n\n');
  };

  const beginCorrection = () => {
    setCorrectionDraft(manualCorrection?.text ?? automaticSummaryAsText());
    setCorrectionOpen(true);
  };

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
      showAlert(
        'Preview ready',
        `Clive found ${total} proposed update${total === 1 ? '' : 's'} to look over before anything is created.`
      );
    } catch (error) {
      console.error('Error previewing meeting notes:', error);
      showAlert('Preview failed', 'Clive could not read those notes just now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const applyApprovedNotes = async () => {
    if (busy) return;
    if (selectedCount === 0) {
      showAlert('Nothing ticked', 'Choose at least one proposed update to create.');
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
      showAlert('Notes applied', `Created ${made}.`);
    } catch (error) {
      console.error('Error applying meeting notes:', error);
      showAlert('Apply failed', 'Clive could not apply those notes just now. Please try again.');
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

  /** The stored summary exactly as it is on the row, ready to be written back. */
  const storedSummaryBase = (): Record<string, unknown> => {
    const raw = (meeting.summary ?? '')
      .trim()
      .replace(/^```json\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .replace(/^```\s*\n?/, '')
      .replace(/\n?```\s*$/, '');
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // An older meeting kept plain text here. Fall through.
    }
    return { ...parsedSummary };
  };

  /**
   * Put a human-reviewed recap in front of the generated one without deleting
   * either the generated fields or an earlier correction. This is deliberately
   * an admin action: a shared meeting record should not turn into a wiki edit
   * that any attendee can rewrite after the fact.
   */
  const saveCorrection = async () => {
    const text = correctionDraft.trim();
    if (!text || savingCorrection || !profile?.id || !isHiveAdmin) return;

    setSavingCorrection(true);
    try {
      const base = storedSummaryBase();
      const currentCorrection = parsedSummary.manual_correction;
      const existingHistory = Array.isArray(parsedSummary.manual_correction_history)
        ? parsedSummary.manual_correction_history
        : [];
      const history = currentCorrection?.text?.trim()
        ? [...existingHistory, currentCorrection].slice(-20)
        : existingHistory;
      const correction = {
        text,
        corrected_at: new Date().toISOString(),
        corrected_by: profile.id,
      };

      const { data: updated, error } = await supabase
        .from('meetings')
        .update({
          summary: JSON.stringify({
            ...base,
            manual_correction: correction,
            manual_correction_history: history,
          }),
        })
        .eq('id', meeting.id)
        .select('*')
        .single();
      if (error) throw error;

      if (updated) {
        setMeeting(updated as Meeting);
        onMeetingUpdated?.(updated as Meeting);
      }
      setCorrectionOpen(false);
      showAlert('Summary corrected', 'Members and Clive will now use your corrected recap. The automatic original is still preserved.');
    } catch (error) {
      console.error('Error correcting meeting summary:', error);
      showAlert('Not saved', 'The corrected summary could not be saved just now. Please try again.');
    } finally {
      setSavingCorrection(false);
    }
  };

  /**
   * A desire from the meeting becomes a real HD wish for the person it belongs
   * to.
   *
   * Nat, 2026-08-19, having gone looking for these on Charlee's profile and
   * found nothing: *"Maybe instead of 'wishes', it says like 'desires
   * identified', and then there can be a button like 'add this to my HD
   * wishes'."* Until now the list created nothing anywhere.
   *
   * The mark saying it has been added is written onto the meeting's stored
   * summary, so it is still true tomorrow on somebody else's screen.
   */
  const addDesireToWishes = async (
    desire: { person_name: string; description: string },
    owner: SpeakerMember
  ) => {
    const key = desireKey(desire);
    if (addingDesire || parsedSummary.desires_added?.[key]) return;

    setAddingDesire(key);
    try {
      const description = desire.description.trim();
      const { data: wish, error } = await supabase
        .from('wishes')
        .insert({
          user_id: owner.id,
          community_id: meeting.community_id,
          title: null,
          description,
          raw_input: description,
          status: 'public',
          // The bottom rung of the ladder. Something said out loud in a meeting
          // has been offered to that room and nowhere else, so the wish starts
          // at home and its owner decides if it goes further.
          share_scope: 'hive',
          is_active: true,
          extracted_from: 'meeting',
        })
        .select('id')
        .single();
      if (error) throw error;

      const added = {
        ...(parsedSummary.desires_added ?? {}),
        [key]: {
          wish_id: wish?.id as string,
          added_at: new Date().toISOString(),
          added_for: owner.id,
        },
      };

      const { data: updated, error: saveError } = await supabase
        .from('meetings')
        .update({ summary: JSON.stringify({ ...storedSummaryBase(), desires_added: added }) })
        .eq('id', meeting.id)
        .select('*')
        .single();
      if (saveError) throw saveError;

      if (updated) {
        setMeeting(updated as Meeting);
        onMeetingUpdated?.(updated as Meeting);
      }

      await invalidateWishQueries(meeting.community_id, owner.id);

      showAlert(
        'Added',
        owner.id === profile?.id
          ? 'It is on your HD wishes now.'
          : `It is on ${owner.name ? `${owner.name}'s` : 'their'} HD wishes now.`
      );
    } catch (error) {
      console.error('Error adding a desire to HD wishes:', error);
      showAlert('Not added', 'That desire could not be saved as a wish just now. Please try again.');
    } finally {
      setAddingDesire(null);
    }
  };

  /**
   * A caught insight lands on the Things We Learned board — pressed by its
   * sayer, posted under THEIR name (never Nat's, never Clive's), and marked on
   * the meeting's own summary so this section and any future surface agree.
   * Mirrors addDesireToWishes above; the destination is a board post instead
   * of a wish row.
   */
  const [filingInsight, setFilingInsight] = useState<string | null>(null);
  const fileInsightToBoard = async (item: CaughtInsight) => {
    const key = insightKey(item);
    if (filingInsight || parsedSummary.insights_filed?.[key] || !profile?.id) return;
    setFilingInsight(key);
    try {
      const { data: boards, error: boardError } = await supabase
        .from('board_categories')
        .select('id, name, status')
        .eq('community_id', meeting.community_id)
        .ilike('name', '%things we learned%');
      if (boardError) throw boardError;
      const board = ((boards ?? []) as { id: string; status?: string | null }[])
        .find((row) => !row.status || row.status === 'active');
      if (!board) {
        showAlert('No board found', 'This HIVE has no Things We Learned board yet — an admin can make one, and this stays offered until then.');
        return;
      }

      const insight = item.insight.trim();
      const title = insight.length > 80 ? `${insight.slice(0, 77)}…` : insight;
      const { data: post, error } = await (supabase.from('board_posts') as any)
        .insert({
          community_id: meeting.community_id,
          category_id: board.id,
          author_id: profile.id,
          title,
          content: `${insight}\n\n— caught in the ${formatDateLong(meeting.date)} meeting`,
        })
        .select('id')
        .single();
      if (error) throw error;

      const filed = {
        ...(parsedSummary.insights_filed ?? {}),
        [key]: { post_id: (post as { id: string }).id, filed_at: new Date().toISOString(), filed_by: profile.id },
      };
      const { data: updated, error: saveError } = await supabase
        .from('meetings')
        .update({ summary: JSON.stringify({ ...storedSummaryBase(), insights_filed: filed }) })
        .eq('id', meeting.id)
        .select('*')
        .single();
      if (saveError) throw saveError;
      if (updated) {
        setMeeting(updated as Meeting);
        onMeetingUpdated?.(updated as Meeting);
      }
      showAlert('Posted', 'It is on Things We Learned now, under your name.');
    } catch (error) {
      console.error('Error filing an insight to the board:', error);
      showAlert('Not posted', 'That could not be posted just now. Please try again.');
    } finally {
      setFilingInsight(null);
    }
  };

  const dismissInsight = async (item: CaughtInsight) => {
    const key = insightKey(item);
    if (filingInsight) return;
    setFilingInsight(key);
    try {
      const dismissed = {
        ...(parsedSummary.insights_dismissed ?? {}),
        [key]: { dismissed_at: new Date().toISOString() },
      };
      const { data: updated, error } = await supabase
        .from('meetings')
        .update({ summary: JSON.stringify({ ...storedSummaryBase(), insights_dismissed: dismissed }) })
        .eq('id', meeting.id)
        .select('*')
        .single();
      if (error) throw error;
      if (updated) {
        setMeeting(updated as Meeting);
        onMeetingUpdated?.(updated as Meeting);
      }
    } catch (error) {
      console.error('Error dismissing an insight:', error);
    } finally {
      setFilingInsight(null);
    }
  };

  const handleSpeakerNamesSaved = (names: SpeakerNameMap) => {
    const updated = { ...meeting, speaker_names: names } as Meeting;
    setMeeting(updated);
    onMeetingUpdated?.(updated);
  };

  /**
   * What the room actually said.
   *
   * Lines from the Daily call carry the speaker's real name already. Lines from
   * a recording carry "Speaker A", because AssemblyAI tells voices apart rather
   * than people — so wherever somebody has put a name to a voice
   * (`meetings.speaker_names`, migration 188) that name is what shows here.
   *
   * Held in a memo because `SpeakerNames` reads this list: a fresh array on
   * every render would wipe the name somebody was halfway through typing.
   */
  const transcriptLines = useMemo(
    () => (meeting.transcript_raw ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    [meeting.transcript_raw]
  );

  const hasAnything = Boolean(
    manualCorrection
    || parsedSummary.sections?.length
    || parsedSummary.summary
    || parsedSummary.decisions?.length
    || parsedSummary.details?.length
    || actionItems.length
    || transcriptLines.length
    || cameFromNotes
  );

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center p-4 border-b border-gray-200">
        <Pressable onPress={onBack} className="mr-4">
          <Text className="text-2xl">←</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-xl font-bold text-hive-dark">
            {normalizeHiveBrandText(parsedSummary.title) || 'Meeting Summary'}
          </Text>
          <Text className="text-label">{formatDateLong(meeting.date)}</Text>
        </View>
        {isHiveAdmin && !correctionOpen && (
          <Pressable
            onPress={beginCorrection}
            accessibilityRole="button"
            accessibilityLabel={manualCorrection ? 'Edit corrected meeting summary' : 'Fix meeting summary'}
            className="ml-3 px-3 py-2 rounded-lg border border-honey-300 bg-honey-50 active:bg-honey-100"
          >
            <Text className="text-honey-800 font-semibold text-sm">
              {manualCorrection ? 'Edit correction' : 'Fix summary'}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {meeting.processing_status === 'failed' && (
          <View className="p-4 rounded-xl mb-4 bg-red-50">
            <Text className="font-medium text-red-700">
              Something went wrong writing this summary.
            </Text>
          </View>
        )}

        {correctionOpen && (
          <View className="mb-6 bg-honey-50 border border-honey-200 rounded-xl p-4">
            <Text className="text-lg font-semibold text-hive-dark">Correct this summary</Text>
            <Text className="text-honey-800 mt-1 leading-5">
              Write the recap members should trust. Saving this puts your version in front of the
              automatic one everywhere in HIVE; the automatic original and transcript stay preserved.
            </Text>
            <TextInput
              value={correctionDraft}
              onChangeText={setCorrectionDraft}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Corrected meeting summary"
              placeholder="Write what actually happened, what was decided, and what happens next."
              className="mt-4 bg-white border border-honey-200 rounded-xl p-4 text-gray-800 leading-6"
              style={{ minHeight: 280 }}
            />
            <View className="flex-row flex-wrap gap-3 mt-4">
              <Pressable
                onPress={() => void saveCorrection()}
                disabled={savingCorrection || !correctionDraft.trim()}
                accessibilityRole="button"
                accessibilityState={{ disabled: savingCorrection || !correctionDraft.trim() }}
                className={`bg-honey-500 px-4 py-3 rounded-lg active:bg-honey-600 ${
                  savingCorrection || !correctionDraft.trim() ? 'opacity-60' : ''
                }`}
              >
                <Text className="text-white font-semibold">
                  {savingCorrection ? 'Saving…' : 'Save corrected summary'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setCorrectionOpen(false)}
                disabled={savingCorrection}
                accessibilityRole="button"
                accessibilityState={{ disabled: savingCorrection }}
                className="px-4 py-3 rounded-lg border border-gray-300 bg-white active:bg-gray-50"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </Pressable>
              {manualCorrection && (
                <Pressable
                  onPress={() => setCorrectionDraft(automaticSummaryAsText())}
                  disabled={savingCorrection}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: savingCorrection }}
                  className="px-4 py-3 rounded-lg active:bg-honey-100"
                >
                  <Text className="text-honey-800 font-semibold">Start from automatic version</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {manualCorrection && !correctionOpen && (
          <View className="mb-6">
            <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
              <Text className="text-green-900 font-semibold">Human-corrected summary</Text>
              <Text className="text-green-800 mt-1 text-sm">
                A HIVE admin corrected the automatic recap on{' '}
                {formatDateLong(manualCorrection.corrected_at.slice(0, 10))}.
              </Text>
            </View>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6">{manualCorrection.text}</Text>
            </View>
          </View>
        )}

        {!manualCorrection && parsedSummary.provenance?.kind === 'automatic_activity_record' && (
          <View className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <Text className="text-amber-900 font-semibold">Automatically assembled activity record</Text>
            <Text className="text-amber-800 mt-1 leading-5">
              Built from Meeting Helper notes, meeting-day app activity, saved meeting-day to-dos, and{' '}
              {parsedSummary.provenance.check_in_response_count ?? 0} current-cycle check-in
              {(parsedSummary.provenance.check_in_response_count ?? 0) === 1 ? '' : 's'}.
              {' '}The transcript was not used, and automatically derived activity is not a verified in-meeting decision.
            </Text>
            {typeof parsedSummary.provenance.community_member_count === 'number' && (
              <Text className="text-amber-700 mt-2 text-sm">
                Check-in coverage: {parsedSummary.provenance.check_in_response_count ?? 0} of{' '}
                {parsedSummary.provenance.community_member_count} current members. Anyone without a current-cycle check-in is left out rather than filled from an older cycle.
              </Text>
            )}
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
        {!manualCorrection && parsedSummary.sections && parsedSummary.sections.length > 0 && (
          <View className="mb-6">
            <SummarySections sections={parsedSummary.sections} />
          </View>
        )}

        {!manualCorrection && isLegacy && parsedSummary.summary && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Summary</Text>
            <View className="bg-gray-50 rounded-xl p-4">
              <Text className="text-gray-800 leading-6">{parsedSummary.summary}</Text>
            </View>
          </View>
        )}

        {/* Decisions are not a legacy detail. They are the reason anybody
            opens a summary — Nat, on the Production record: *"there were lots
            of things that were decided at that meeting."* They were hidden the
            moment a meeting had sections, which is every meeting sealed from
            the deck. */}
        {!manualCorrection && parsedSummary.decisions && parsedSummary.decisions.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              {parsedSummary.provenance?.decisions_verified
                ? 'Verified in-meeting decisions'
                : 'Decisions found in notes'}
            </Text>
            {!parsedSummary.provenance?.decisions_verified && (
              <Text className="text-label mb-2">
                These have not been verified against the meeting record.
              </Text>
            )}
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

        {/* What people said they need is worth the same on any meeting,
            sections or not — same reasoning as Decisions above.

            It used to be headed "Wishes Surfaced" and it created nothing
            anywhere, so Nat went looking for one on Charlee's profile and it
            was not there. Both halves are fixed: the heading says what the list
            IS, and each line can become a real HD wish for the person it
            belongs to. */}
        {!manualCorrection && parsedSummary.wishes_surfaced && parsedSummary.wishes_surfaced.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Desires identified</Text>
            <Text className="text-label mb-1">These came out of the conversation.</Text>
            <Text className="text-label mb-2">Nothing has been created from them yet.</Text>
            <View className="bg-honey-50 rounded-xl p-4">
              {parsedSummary.wishes_surfaced.map((desire, index) => {
                const key = desireKey(desire);
                const already = parsedSummary.desires_added?.[key];
                const owner = memberCalled(desire.person_name, members);
                const isMine = !!owner && owner.id === profile?.id;
                // Only the person a desire belongs to may turn it into their
                // wish — Nat, 2026-08-19: "protect that button by user only,
                // so each sign-in can only click on their own." Admins used to
                // be able to add for anyone; a wish is a personal ask, and
                // putting words in someone's mouth is not an admin job.
                const canAdd = isMine;
                const firstName = (owner?.name ?? desire.person_name).trim().split(' ')[0];
                const working = addingDesire === key;

                return (
                  <View key={index} className={index > 0 ? 'mt-3 pt-3 border-t border-honey-200' : ''}>
                    <Text className="font-medium text-honey-800">{desire.person_name}</Text>
                    <Text className="text-gray-700 mt-1">{desire.description}</Text>

                    {already ? (
                      <Text className="text-honey-700 font-medium mt-2">
                        ✓ Added to {isMine ? 'your' : `${firstName}'s`} HD wishes
                      </Text>
                    ) : canAdd && owner ? (
                      <Pressable
                        onPress={() => addDesireToWishes(desire, owner)}
                        disabled={!!addingDesire}
                        accessibilityRole="button"
                        className={`mt-3 bg-honey-500 px-4 py-2 rounded-lg self-start active:bg-honey-600 ${
                          addingDesire ? 'opacity-60' : ''
                        }`}
                      >
                        <Text className="text-white font-semibold">
                          {working
                            ? 'Adding…'
                            : isMine
                              ? 'Add to my HD wishes'
                              : `Add to ${firstName}'s HD wishes`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Worth keeping — the lines the meeting caught. Same contract as the
            desires above (lib/desires.ts): the person who said it is the only
            one who can post it, it lands on Things We Learned under THEIR
            name, and the mark lives on this meeting's own summary. Nat,
            2026-08-19: "if you say something clever... those should auto
            populate" — offered, never auto-posted. */}
        {!manualCorrection && parsedSummary.insights_caught && parsedSummary.insights_caught.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">Worth keeping</Text>
            <Text className="text-label mb-2">Lines the meeting caught. Each is its sayer's to post, or put away.</Text>
            <View className="bg-honey-50 rounded-xl p-4">
              {parsedSummary.insights_caught.map((item, index) => {
                const key = insightKey(item);
                const filed = parsedSummary.insights_filed?.[key];
                const dismissed = parsedSummary.insights_dismissed?.[key];
                const owner = memberCalled(item.person_name, members);
                const isMine = !!owner && owner.id === profile?.id;
                const working = filingInsight === key;
                if (dismissed && !filed) return null;
                return (
                  <View key={index} className={index > 0 ? 'mt-3 pt-3 border-t border-honey-200' : ''}>
                    <Text className="font-medium text-honey-800">{item.person_name}</Text>
                    <Text className="text-gray-700 mt-1" style={{ fontStyle: 'italic' }}>“{item.insight}”</Text>
                    {filed ? (
                      <Text className="text-honey-700 font-medium mt-2">✓ On Things We Learned</Text>
                    ) : isMine ? (
                      <View className="flex-row items-center gap-4 mt-3">
                        <Pressable
                          onPress={() => void fileInsightToBoard(item)}
                          disabled={!!filingInsight}
                          accessibilityRole="button"
                          className={`bg-honey-500 px-4 py-2 rounded-lg active:bg-honey-600 ${filingInsight ? 'opacity-60' : ''}`}
                        >
                          <Text className="text-white font-semibold">
                            {working ? 'Posting…' : 'Post to Things We Learned'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void dismissInsight(item)}
                          disabled={!!filingInsight}
                          accessibilityRole="button"
                          hitSlop={8}
                        >
                          <Text className="text-gray-500 font-semibold">✕ Put it away</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {!manualCorrection && isLegacy && parsedSummary.details && parsedSummary.details.length > 0 && (
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

        {/* What was said, kept only for HIVEs that have their transcript
            switch on. It is collapsed to start with because the summary above
            is what a person actually wants; this is here for the night you
            need the exact words. */}
        {transcriptLines.length > 0 && (
          <View className="mb-6">
            {/* Naming the voices comes first, because the transcript
                underneath reads differently once it is done. */}
            <SpeakerNames
              meetingId={meeting.id}
              lines={transcriptLines}
              members={members}
              names={speakerNames}
              canEdit={isHiveAdmin}
              onSaved={handleSpeakerNamesSaved}
            />

            <Pressable
              onPress={() => setTranscriptOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={transcriptOpen ? 'Hide what was said' : 'Read what was said'}
              className="flex-row items-center justify-between"
            >
              <Text className="text-lg font-semibold text-gray-700 mb-2">What was said</Text>
              <Text className="text-label mb-2">{transcriptOpen ? 'Hide' : 'Read it'}</Text>
            </Pressable>
            {transcriptOpen ? (
              <View className="bg-gray-50 rounded-xl p-4">
                {transcriptLines.map((line, index) => (
                  <Text key={index} className={`text-gray-700 ${index > 0 ? 'mt-2' : ''}`}>
                    {transcriptLineWithNames(line, speakerNames)}
                  </Text>
                ))}
              </View>
            ) : (
              <Text className="text-label">
                {transcriptLines.length} {transcriptLines.length === 1 ? 'line' : 'lines'}, each one
                marked with who said it.
              </Text>
            )}
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

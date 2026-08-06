import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../../types';
import {
  getActiveMentionQuery,
  getGroupMentionLabel,
  getMentionedGroups,
  getMentionedMembers,
  getMentionSuggestions,
  hasBroadcastMention,
  insertMention,
  type MentionReach,
  type MentionTarget,
} from '../mentions';

type MentionMember = Pick<Profile, 'id' | 'name'>;
type TextSelection = { start: number; end: number };

interface UseMentionInputOptions {
  value: string;
  onChangeText: (text: string) => void;
  members: MentionMember[];
  currentUserId?: string;
  suggestionLimit?: number;
  /**
   * How far the thing being written can travel. Build it with
   * `useMentionReach()` on the screen that knows — the room's reach, the
   * board's reach, the wish's share scope.
   *
   * The offer and the reading both go through this one object, so a row can
   * never be offered that sending would then quietly drop. Left out, every
   * answer settles on the group that cannot leak: everyone who can already see
   * this.
   */
  reach?: MentionReach | null;
}

export function useMentionInput({
  value,
  onChangeText,
  members,
  currentUserId,
  suggestionLimit = 6,
  reach = null,
}: UseMentionInputOptions) {
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [selectionOverride, setSelectionOverride] = useState<TextSelection | null>(null);

  const cursorIndex = selection.start === 0 && selection.end === 0 && value.length > 0
    ? value.length
    : selection.start;
  const mentionQuery = useMemo(() => getActiveMentionQuery(value, cursorIndex), [cursorIndex, value]);
  const mentionSuggestions = useMemo(
    () => mentionQuery === null
      ? []
      : getMentionSuggestions(mentionQuery, members, currentUserId, suggestionLimit, reach),
    [currentUserId, members, mentionQuery, reach, suggestionLimit]
  );
  const mentionsEveryone = useMemo(() => hasBroadcastMention(value), [value]);
  const mentionedMembers = useMemo(
    () => getMentionedMembers(value, members, currentUserId, reach),
    [currentUserId, members, reach, value]
  );
  /**
   * The whole groups this text tags, and the sentence that names them.
   *
   * A screen sends the members itself; these two say who ELSE was named, which
   * is what the "you tagged everyone" pill has to be able to say out loud —
   * "Everyone in HIVE" was written when there was one HIVE.
   */
  const mentionedGroups = useMemo(() => getMentionedGroups(value, reach), [reach, value]);
  const groupMentionLabel = useMemo(() => getGroupMentionLabel(value, reach), [reach, value]);

  useEffect(() => {
    if (!selectionOverride) return;

    const timeout = setTimeout(() => setSelectionOverride(null), 0);
    return () => clearTimeout(timeout);
  }, [selectionOverride]);

  const handleChangeText = (text: string) => {
    onChangeText(text);
    setSelection((previousSelection) => {
      const wasAtTextEnd = previousSelection.start === value.length && previousSelection.end === value.length;
      const lookedUnreported = previousSelection.start === 0 && previousSelection.end === 0 && text.length > 0;
      if (wasAtTextEnd || lookedUnreported) {
        return { start: text.length, end: text.length };
      }
      return previousSelection;
    });
  };

  const handleSelectMention = (member: MentionTarget) => {
    const inserted = insertMention(value, cursorIndex, member);
    const nextSelection = { start: inserted.cursorIndex, end: inserted.cursorIndex };
    onChangeText(inserted.text);
    setSelection(nextSelection);
    setSelectionOverride(nextSelection);
  };

  const resetMentionSelection = () => {
    setSelection({ start: 0, end: 0 });
    setSelectionOverride(null);
  };

  return {
    cursorIndex,
    mentionQuery,
    mentionSuggestions,
    mentionsEveryone,
    mentionedMembers,
    mentionedGroups,
    groupMentionLabel,
    resetMentionSelection,
    selectMention: handleSelectMention,
    textInputMentionProps: {
      onChangeText: handleChangeText,
      onSelectionChange: (event: any) => setSelection(event.nativeEvent.selection),
      selection: selectionOverride ?? undefined,
    },
  };
}

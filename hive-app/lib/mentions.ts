import type { Profile } from '../types';
import {
  expandMemberAliasTerms,
  getMemberAliasesForName,
  normalizeMemberHandle,
} from './memberAliases';

export type MentionTarget = Pick<Profile, 'id' | 'name'> & {
  handle?: string;
  isBroadcast?: boolean;
  description?: string;
};

const BROADCAST_MENTION_ID = '__broadcast_hive__';
const BROADCAST_MENTION_HANDLES = new Set([
  'hive',
  'all',
  'everyone',
  'every',
  'everybody',
  'group',
  'community',
  'members',
]);
const BROADCAST_MENTION_SUGGESTION: MentionTarget = {
  id: BROADCAST_MENTION_ID,
  name: 'Everyone in HIVE',
  handle: 'hive',
  isBroadcast: true,
  description: 'Tag the whole group',
};

function normalizeMentionHandle(value?: string | null): string {
  return normalizeMemberHandle(value);
}

function getFirstName(name?: string) {
  return name?.trim().split(/\s+/)[0] || '';
}

function getMemberMentionHandles(name?: string) {
  const handles = [
    getFirstName(name),
    name,
    ...getMemberAliasesForName(name),
  ].map(normalizeMentionHandle).filter(Boolean);

  return Array.from(new Set(handles));
}

function getMentionQueryHandles(value: string) {
  const handles = [
    normalizeMentionHandle(value),
    ...expandMemberAliasTerms(value).map(normalizeMentionHandle),
  ].filter(Boolean);

  return Array.from(new Set(handles));
}

function getMentionHandles(content: string) {
  return new Set(
    Array.from(content.matchAll(/@([a-z0-9._-]+)/gi))
      .flatMap((match) => getMentionQueryHandles(match[1]))
      .filter(Boolean)
  );
}

export function getBroadcastMentionSuggestion(query: string | null | undefined): MentionTarget | null {
  const normalizedQuery = normalizeMentionHandle(query);
  if (!normalizedQuery) return BROADCAST_MENTION_SUGGESTION;

  const queryHandles = getMentionQueryHandles(query || '');
  const matchesBroadcast = queryHandles.some((candidate) =>
    Array.from(BROADCAST_MENTION_HANDLES).some((handle) =>
      handle.startsWith(candidate) || handle.includes(candidate)
    )
  );

  return matchesBroadcast ? BROADCAST_MENTION_SUGGESTION : null;
}

export function hasBroadcastMention(content: string): boolean {
  const mentionHandles = getMentionHandles(content);
  return Array.from(mentionHandles).some((handle) => BROADCAST_MENTION_HANDLES.has(handle));
}

export function getMentionedMembers(
  content: string,
  members: Pick<Profile, 'id' | 'name'>[],
  currentUserId?: string
): Pick<Profile, 'id' | 'name'>[] {
  const mentionHandles = getMentionHandles(content);

  if (mentionHandles.size === 0) return [];

  if (Array.from(mentionHandles).some((handle) => BROADCAST_MENTION_HANDLES.has(handle))) {
    return members.filter((member) => member.id && member.id !== currentUserId);
  }

  const mentioned = new Map<string, Pick<Profile, 'id' | 'name'>>();

  members.forEach((member) => {
    if (!member.id || member.id === currentUserId || !member.name) return;

    const memberHandles = getMemberMentionHandles(member.name);

    if (memberHandles.some((handle) => mentionHandles.has(handle))) {
      mentioned.set(member.id, member);
    }
  });

  return Array.from(mentioned.values());
}

export function getActiveMentionQuery(text: string, cursorIndex: number): string | null {
  const beforeCursor = text.slice(0, cursorIndex);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9._-]*)$/i);
  return match ? match[2] : null;
}

export function getMentionSuggestions(
  query: string,
  members: Pick<Profile, 'id' | 'name'>[],
  currentUserId?: string,
  limit = 6
): MentionTarget[] {
  const normalizedQuery = normalizeMentionHandle(query);
  const queryHandles = getMentionQueryHandles(query);
  const broadcastSuggestion = getBroadcastMentionSuggestion(query);

  const memberSuggestions = members
    .filter((member) => member.id && member.id !== currentUserId && member.name)
    .filter((member) => {
      if (!normalizedQuery) return true;
      const memberHandles = getMemberMentionHandles(member.name);
      return queryHandles.some((candidate) =>
        memberHandles.some((handle) => handle.startsWith(candidate) || handle.includes(candidate))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, broadcastSuggestion ? Math.max(limit - 1, 0) : limit);

  return broadcastSuggestion
    ? [broadcastSuggestion, ...memberSuggestions]
    : memberSuggestions;
}

export function getMentionTargetHandle(member: Pick<Profile, 'name'> & Pick<MentionTarget, 'handle'>): string {
  return member.handle || getFirstName(member.name);
}

export function insertMention(
  text: string,
  cursorIndex: number,
  member: Pick<Profile, 'name'> & Pick<MentionTarget, 'handle'>
): { text: string; cursorIndex: number } {
  const beforeCursor = text.slice(0, cursorIndex);
  const afterCursor = text.slice(cursorIndex);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9._-]*)$/i);
  const handle = `@${getMentionTargetHandle(member)} `;

  if (!match) {
    const prefix = beforeCursor.endsWith(' ') || beforeCursor.length === 0 ? '' : ' ';
    const nextText = `${beforeCursor}${prefix}${handle}${afterCursor}`;
    return {
      text: nextText,
      cursorIndex: beforeCursor.length + prefix.length + handle.length,
    };
  }

  const mentionStart = beforeCursor.length - match[2].length - 1;
  const nextText = `${beforeCursor.slice(0, mentionStart)}${handle}${afterCursor}`;
  return {
    text: nextText,
    cursorIndex: mentionStart + handle.length,
  };
}

import type { Profile } from '../types';

const BROADCAST_MENTION_HANDLES = new Set(['everyone', 'all', 'group']);

function normalizeMentionHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getFirstName(name?: string) {
  return name?.trim().split(/\s+/)[0] || '';
}

export function getMentionedMembers(
  content: string,
  members: Pick<Profile, 'id' | 'name'>[],
  currentUserId?: string
): Pick<Profile, 'id' | 'name'>[] {
  const mentionHandles = new Set(
    Array.from(content.matchAll(/@([a-z0-9._-]+)/gi))
      .map((match) => normalizeMentionHandle(match[1]))
      .filter(Boolean)
  );

  if (mentionHandles.size === 0) return [];

  if (Array.from(mentionHandles).some((handle) => BROADCAST_MENTION_HANDLES.has(handle))) {
    return members.filter((member) => member.id && member.id !== currentUserId);
  }

  const mentioned = new Map<string, Pick<Profile, 'id' | 'name'>>();

  members.forEach((member) => {
    if (!member.id || member.id === currentUserId || !member.name) return;

    const nameParts = member.name.split(/\s+/).filter(Boolean);
    const firstName = normalizeMentionHandle(nameParts[0] || '');
    const fullName = normalizeMentionHandle(member.name);

    if (mentionHandles.has(firstName) || mentionHandles.has(fullName)) {
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
): Pick<Profile, 'id' | 'name'>[] {
  const normalizedQuery = normalizeMentionHandle(query);

  return members
    .filter((member) => member.id && member.id !== currentUserId && member.name)
    .filter((member) => {
      if (!normalizedQuery) return true;
      const firstName = normalizeMentionHandle(getFirstName(member.name));
      const fullName = normalizeMentionHandle(member.name);
      return firstName.startsWith(normalizedQuery) || fullName.includes(normalizedQuery);
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function insertMention(
  text: string,
  cursorIndex: number,
  member: Pick<Profile, 'name'>
): { text: string; cursorIndex: number } {
  const beforeCursor = text.slice(0, cursorIndex);
  const afterCursor = text.slice(cursorIndex);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9._-]*)$/i);
  const handle = `@${getFirstName(member.name)} `;

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

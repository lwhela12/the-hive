import type { ChatRoom, ChatRoomMember, Profile } from '../types';

export type ChatRoomThemeKey = 'honey' | 'sky' | 'rose' | 'sage' | 'lilac' | 'slate' | 'midnight';

export interface ChatRoomTheme {
  key: ChatRoomThemeKey;
  label: string;
  accent: string;
  accentSoft: string;
  border: string;
  listBackground: string;
  unreadBackground: string;
  surface: string;
  header: string;
  input: string;
  messageBackground: string;
  ownBubble: string;
  ownBubbleText: string;
  /**
   * Somebody else's bubble, and the ink in it. Optional because the six
   * daylight themes all agreed on white-with-charcoal and had it hard-coded
   * inside RoomMessageItem — which is exactly what made a dark theme
   * impossible: the transcript would have been charcoal on near-black. A theme
   * that says nothing here still gets the old values.
   */
  otherBubble?: string;
  otherBubbleText?: string;
  /** Timestamps and "edited" — the quietest text on the screen. */
  metaText?: string;
}

export const CHAT_ROOM_THEMES: Record<ChatRoomThemeKey, ChatRoomTheme> = {
  honey: {
    key: 'honey',
    label: 'Honey',
    accent: '#bd9348',
    accentSoft: 'rgba(189,147,72,0.16)',
    border: 'rgba(222,193,129,0.5)',
    listBackground: 'rgba(255,255,255,0.82)',
    unreadBackground: 'rgba(255,248,232,0.96)',
    surface: '#fff8e8',
    header: '#fffdf5',
    input: '#fff8e8',
    messageBackground: '#faf6ec',
    ownBubble: '#bd9348',
    ownBubbleText: '#ffffff',
  },
  sky: {
    key: 'sky',
    label: 'Sky',
    accent: '#4f8cc9',
    accentSoft: 'rgba(79,140,201,0.16)',
    border: 'rgba(79,140,201,0.34)',
    listBackground: '#f4f9ff',
    unreadBackground: '#eaf4ff',
    surface: '#eaf4ff',
    header: '#f7fbff',
    input: '#edf6ff',
    messageBackground: '#f3f8fd',
    ownBubble: '#4f8cc9',
    ownBubbleText: '#ffffff',
  },
  rose: {
    key: 'rose',
    label: 'Rose',
    accent: '#c05f77',
    accentSoft: 'rgba(192,95,119,0.16)',
    border: 'rgba(192,95,119,0.32)',
    listBackground: '#fff6f8',
    unreadBackground: '#ffeef3',
    surface: '#ffeef3',
    header: '#fff8fa',
    input: '#fff0f4',
    messageBackground: '#fff7f8',
    ownBubble: '#c05f77',
    ownBubbleText: '#ffffff',
  },
  sage: {
    key: 'sage',
    label: 'Sage',
    accent: '#668f63',
    accentSoft: 'rgba(102,143,99,0.16)',
    border: 'rgba(102,143,99,0.32)',
    listBackground: '#f6fbf3',
    unreadBackground: '#edf7e8',
    surface: '#edf7e8',
    header: '#f8fbf5',
    input: '#f0f7eb',
    messageBackground: '#f6faf2',
    ownBubble: '#668f63',
    ownBubbleText: '#ffffff',
  },
  lilac: {
    key: 'lilac',
    label: 'Lilac',
    accent: '#7a6cc8',
    accentSoft: 'rgba(122,108,200,0.16)',
    border: 'rgba(122,108,200,0.3)',
    listBackground: '#f8f6ff',
    unreadBackground: '#f0edff',
    surface: '#f0edff',
    header: '#faf9ff',
    input: '#f2f0ff',
    messageBackground: '#f8f7ff',
    ownBubble: '#7a6cc8',
    ownBubbleText: '#ffffff',
  },
  slate: {
    key: 'slate',
    label: 'Slate',
    accent: '#4d5962',
    accentSoft: 'rgba(77,89,98,0.14)',
    border: 'rgba(77,89,98,0.24)',
    listBackground: '#f6f7f7',
    unreadBackground: '#eceff1',
    surface: '#eceff1',
    header: '#fafafa',
    input: '#f0f2f3',
    messageBackground: '#f6f7f8',
    ownBubble: '#4d5962',
    ownBubbleText: '#ffffff',
  },
  /**
   * Space, for the one room that belongs to every HIVE.
   *
   * Not offered in the theme picker — it is what HIVE-Wide wears, not a taste.
   * The values are lifted from lib/pageSkin.ts's DARK so the room matches the
   * HIVE-Wide pages exactly rather than being a second, nearly-identical black.
   */
  midnight: {
    key: 'midnight',
    label: 'Midnight',
    accent: '#e0be76',
    accentSoft: 'rgba(224,190,118,0.18)',
    border: 'rgba(255,255,255,0.14)',
    listBackground: 'rgba(255,255,255,0.05)',
    unreadBackground: 'rgba(224,190,118,0.12)',
    surface: 'rgba(255,255,255,0.07)',
    header: '#07080F',
    input: 'rgba(255,255,255,0.07)',
    messageBackground: '#05060B',
    ownBubble: '#b08d43',
    ownBubbleText: '#FFFFFF',
    otherBubble: 'rgba(255,255,255,0.09)',
    otherBubbleText: '#F6F4E5',
    metaText: 'rgba(246,244,229,0.5)',
  },
};

export const DEFAULT_CHAT_ROOM_THEME: ChatRoomThemeKey = 'honey';

type RoomWithMembers = ChatRoom & {
  members?: Array<(ChatRoomMember & { user?: Profile }) | { user?: Profile; user_id?: string }>;
};

export function normalizeChatRoomTheme(value?: string | null): ChatRoomThemeKey {
  if (value && value in CHAT_ROOM_THEMES) {
    return value as ChatRoomThemeKey;
  }
  return DEFAULT_CHAT_ROOM_THEME;
}

export function getOwnRoomMembership(room: RoomWithMembers, currentUserId?: string) {
  if (!currentUserId) return undefined;
  return room.members?.find((member) => {
    const memberUserId = 'user_id' in member ? member.user_id : undefined;
    return memberUserId === currentUserId || member.user?.id === currentUserId;
  });
}

export function getOtherRoomMembers(room: RoomWithMembers, currentUserId?: string): Profile[] {
  return (
    room.members
      ?.filter((member) => member.user?.id !== currentUserId)
      .map((member) => member.user)
      .filter((user): user is Profile => !!user) || []
  );
}

function cleanString(value?: string | null): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

export function getRoomCustomization(room: RoomWithMembers, currentUserId?: string) {
  const ownMembership = getOwnRoomMembership(room, currentUserId) as ChatRoomMember | undefined;

  const title = cleanString(room.custom_title) ?? cleanString(ownMembership?.custom_title);
  const emoji = cleanString(room.custom_emoji) ?? cleanString(ownMembership?.custom_emoji);
  const imageUrl = cleanString(room.custom_image_url) ?? cleanString(ownMembership?.custom_image_url);
  const backgroundImageUrl =
    cleanString(room.custom_background_image_url) ?? cleanString(ownMembership?.custom_background_image_url);
  const background =
    cleanString(room.custom_background) ?? cleanString(ownMembership?.custom_background) ?? DEFAULT_CHAT_ROOM_THEME;

  return {
    title,
    emoji,
    imageUrl,
    backgroundImageUrl,
    themeKey: normalizeChatRoomTheme(background),
  };
}

export function getChatRoomTheme(room: RoomWithMembers, currentUserId?: string): ChatRoomTheme {
  // The room every HIVE shares is space, and that is not a preference — it is
  // the same rule the rail, the header and the HIVE-Wide pages follow. It wins
  // over a saved theme rather than merging with one, because half a space room
  // is the cream-header-on-a-starfield frame Nat photographed (2026-08-03).
  if (room.reach === 'all_hives') {
    return CHAT_ROOM_THEMES.midnight;
  }
  const { themeKey } = getRoomCustomization(room, currentUserId);
  return CHAT_ROOM_THEMES[themeKey];
}

export function getRoomDefaultName(room: RoomWithMembers, currentUserId?: string): string {
  const otherMembers = getOtherRoomMembers(room, currentUserId);

  if (room.room_type === 'community') {
    return room.name || 'General';
  }

  if (room.room_type === 'group_dm') {
    if (room.name) return room.name;
    if (otherMembers.length === 0) return 'Group';
    return otherMembers.map((member) => member.name.split(' ')[0]).join(', ');
  }

  return otherMembers[0]?.name || 'Direct Message';
}

export function getRoomDisplayName(room: RoomWithMembers, currentUserId?: string): string {
  return getRoomCustomization(room, currentUserId).title || getRoomDefaultName(room, currentUserId);
}

export function getRoomSubtitle(room: RoomWithMembers, currentUserId?: string): string | null {
  const customTitle = getRoomCustomization(room, currentUserId).title;
  const defaultName = getRoomDefaultName(room, currentUserId);

  if (customTitle && customTitle !== defaultName) {
    return defaultName;
  }

  if (room.room_type === 'community') {
    return 'Community chat';
  }

  if (room.room_type === 'group_dm') {
    return `${room.members?.length || 0} members`;
  }

  return null;
}

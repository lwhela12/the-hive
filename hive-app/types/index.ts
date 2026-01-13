export type UserRole = 'member' | 'treasurer' | 'admin';

// Board types
export type BoardCategoryType =
  | 'announcements'
  | 'general'
  | 'queen_bee'
  | 'resources'
  | 'introductions'
  | 'custom';

// Chat types
export type ChatRoomType = 'community' | 'dm';
export type WishStatus = 'private' | 'public' | 'fulfilled' | 'replaced';
export type QueenBeeStatus = 'upcoming' | 'active' | 'completed';

export interface QueenBeePreference {
  preferred_month?: string;
  reason?: string;
  timeframe?: string;
}
export type EventType = 'meeting' | 'queen_bee' | 'birthday' | 'custom';
export type NotificationType =
  | 'wish_match'
  | 'meeting_summary'
  | 'queen_bee_update'
  | 'action_item'
  | 'general'
  | 'board_reply'
  | 'board_mention'
  | 'chat_dm'
  | 'chat_mention';
export type ExtractionSource = 'chat' | 'onboarding' | 'meeting' | 'manual';

export interface Community {
  id: string;
  name: string;
  slug: string;
  created_by?: string;
  created_at: string;
}

export interface CommunityMembership {
  id: string;
  community_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  community?: Community;
  user?: Profile;
}

export interface CommunityInvite {
  id: string;
  community_id: string;
  email: string;
  role: UserRole;
  invited_by?: string;
  token: string;
  expires_at?: string;
  accepted_at?: string;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferred_contact: string;
  birthday?: string;
  occupation?: string;
  role: UserRole;
  queen_bee_month?: string;
  queen_bee_preference?: QueenBeePreference;
  google_calendar_id?: string;
  google_refresh_token?: string;
  avatar_url?: string;
  push_token?: string;
  onboarded_at?: string;
  current_community_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  user_id: string;
  community_id: string;
  description: string;
  raw_input?: string;
  extracted_from: ExtractionSource;
  created_at: string;
  user?: Profile;
}

export interface Wish {
  id: string;
  user_id: string;
  community_id: string;
  description: string;
  raw_input?: string;
  status: WishStatus;
  is_active: boolean;
  extracted_from: ExtractionSource;
  fulfilled_by?: string;
  created_at: string;
  fulfilled_at?: string;
  replaced_at?: string;
  user?: Profile;
}

export interface QueenBee {
  id: string;
  user_id: string;
  community_id: string;
  month: string;
  project_title: string;
  project_description?: string;
  status: QueenBeeStatus;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface QueenBeeUpdate {
  id: string;
  queen_bee_id: string;
  user_id: string;
  community_id: string;
  content: string;
  created_at: string;
  user?: Profile;
}

export interface Meeting {
  id: string;
  community_id: string;
  date: string;
  audio_url?: string;
  transcript_raw?: string;
  transcript_attributed?: string;
  summary?: string;
  recorded_by?: string;
  processing_status: 'pending' | 'transcribing' | 'summarizing' | 'complete' | 'failed';
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  community_id: string;
  description: string;
  assigned_to?: string;
  due_date?: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
  assigned_user?: Profile;
}

export interface HoneyPot {
  id: string;
  community_id: string;
  balance: number;
  updated_by?: string;
  updated_at: string;
}

export interface HoneyPotTransaction {
  id: string;
  community_id: string;
  amount: number;
  transaction_type: 'deposit' | 'withdrawal' | 'adjustment';
  note?: string;
  recorded_by?: string;
  created_at: string;
}

export interface Event {
  id: string;
  community_id: string;
  title: string;
  description?: string;
  event_date: string;
  event_time?: string;
  event_type: EventType;
  google_event_id?: string;
  related_user_id?: string;
  related_queen_bee_id?: string;
  created_by?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  community_id: string;
  notification_type: NotificationType;
  title: string;
  content?: string;
  related_wish_id?: string;
  related_meeting_id?: string;
  related_action_item_id?: string;
  read_at?: string;
  email_sent: boolean;
  created_at: string;
}

export type ConversationMode = 'default' | 'onboarding';

// Context summary types for smart LLM context management
export type ContextSummaryType = 'conversation' | 'board_activity' | 'room_messages' | 'meetings';

export interface ContextSummary {
  id: string;
  community_id: string;
  user_id?: string;
  summary_type: ContextSummaryType;
  conversation_id?: string;
  summary_content: string;
  source_count: number;
  last_source_timestamp?: string;
  estimated_tokens: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  mode: ConversationMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  community_id: string;
  conversation_id?: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Record<string, unknown>;
  created_at: string;
}

// ============================================
// MESSAGE BOARD TYPES
// ============================================

export interface BoardCategory {
  id: string;
  community_id: string;
  name: string;
  description?: string;
  category_type: BoardCategoryType;
  icon?: string;
  display_order: number;
  is_system: boolean;
  requires_admin: boolean;
  requires_approval: boolean;
  approved_at?: string;
  approved_by?: string;
  created_by?: string;
  created_at: string;
}

export interface BoardPost {
  id: string;
  community_id: string;
  category_id: string;
  author_id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  is_locked: boolean;
  edited_at?: string;
  reply_count: number;
  last_reply_at?: string;
  last_reply_by?: string;
  created_at: string;
  // Joined data
  author?: Profile;
  category?: BoardCategory;
  reactions?: BoardReaction[];
}

export interface BoardReply {
  id: string;
  community_id: string;
  post_id: string;
  parent_reply_id?: string;
  author_id: string;
  content: string;
  edited_at?: string;
  created_at: string;
  // Joined data
  author?: Profile;
  reactions?: BoardReaction[];
  nested_replies?: BoardReply[];
}

export interface BoardReaction {
  id: string;
  community_id: string;
  post_id?: string;
  reply_id?: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
}

// ============================================
// INTERGROUP CHAT TYPES
// ============================================

export interface ChatRoom {
  id: string;
  community_id: string;
  room_type: ChatRoomType;
  name?: string;
  description?: string;
  created_by?: string;
  created_at: string;
  // Computed/joined
  members?: ChatRoomMember[];
  last_message?: RoomMessage;
  unread_count?: number;
}

export interface ChatRoomMember {
  id: string;
  room_id: string;
  user_id: string;
  last_read_at: string;
  muted: boolean;
  joined_at: string;
  user?: Profile;
}

export interface RoomMessage {
  id: string;
  community_id: string;
  room_id: string;
  sender_id: string;
  content: string;
  edited_at?: string;
  deleted_at?: string;
  reply_to_id?: string;
  created_at: string;
  // Joined data
  sender?: Profile;
  reactions?: MessageReaction[];
  reply_to?: RoomMessage;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
}

export interface TypingIndicator {
  id: string;
  room_id: string;
  user_id: string;
  updated_at: string;
  user?: Profile;
}

export interface Database {
  public: {
    Tables: {
      communities: {
        Row: Community;
        Insert: Omit<Community, 'id' | 'created_at'>;
        Update: Partial<Omit<Community, 'id' | 'created_at'>>;
      };
      community_memberships: {
        Row: CommunityMembership;
        Insert: Omit<CommunityMembership, 'id' | 'created_at'>;
        Update: Partial<Omit<CommunityMembership, 'id' | 'created_at'>>;
      };
      community_invites: {
        Row: CommunityInvite;
        Insert: Omit<CommunityInvite, 'id' | 'created_at'>;
        Update: Partial<Omit<CommunityInvite, 'id' | 'created_at'>>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      skills: {
        Row: Skill;
        Insert: Omit<Skill, 'id' | 'created_at'>;
        Update: Partial<Omit<Skill, 'id' | 'created_at'>>;
      };
      wishes: {
        Row: Wish;
        Insert: Omit<Wish, 'id' | 'created_at'>;
        Update: Partial<Omit<Wish, 'id' | 'created_at'>>;
      };
      queen_bees: {
        Row: QueenBee;
        Insert: Omit<QueenBee, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<QueenBee, 'id' | 'created_at'>>;
      };
      queen_bee_updates: {
        Row: QueenBeeUpdate;
        Insert: Omit<QueenBeeUpdate, 'id' | 'created_at'>;
        Update: Partial<Omit<QueenBeeUpdate, 'id' | 'created_at'>>;
      };
      meetings: {
        Row: Meeting;
        Insert: Omit<Meeting, 'id' | 'created_at'>;
        Update: Partial<Omit<Meeting, 'id' | 'created_at'>>;
      };
      action_items: {
        Row: ActionItem;
        Insert: Omit<ActionItem, 'id' | 'created_at'>;
        Update: Partial<Omit<ActionItem, 'id' | 'created_at'>>;
      };
      honey_pot: {
        Row: HoneyPot;
        Insert: Omit<HoneyPot, 'id' | 'updated_at'>;
        Update: Partial<Omit<HoneyPot, 'id'>>;
      };
      honey_pot_transactions: {
        Row: HoneyPotTransaction;
        Insert: Omit<HoneyPotTransaction, 'id' | 'created_at'>;
        Update: Partial<Omit<HoneyPotTransaction, 'id' | 'created_at'>>;
      };
      events: {
        Row: Event;
        Insert: Omit<Event, 'id' | 'created_at'>;
        Update: Partial<Omit<Event, 'id' | 'created_at'>>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatMessage, 'id' | 'created_at'>>;
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Conversation, 'id' | 'created_at'>>;
      };
      context_summaries: {
        Row: ContextSummary;
        Insert: Omit<ContextSummary, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ContextSummary, 'id' | 'created_at'>>;
      };
      // Message Board tables
      board_categories: {
        Row: BoardCategory;
        Insert: Omit<BoardCategory, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardCategory, 'id' | 'created_at'>>;
      };
      board_posts: {
        Row: BoardPost;
        Insert: Omit<BoardPost, 'id' | 'created_at' | 'reply_count'>;
        Update: Partial<Omit<BoardPost, 'id' | 'created_at'>>;
      };
      board_replies: {
        Row: BoardReply;
        Insert: Omit<BoardReply, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardReply, 'id' | 'created_at'>>;
      };
      board_reactions: {
        Row: BoardReaction;
        Insert: Omit<BoardReaction, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardReaction, 'id' | 'created_at'>>;
      };
      // Intergroup Chat tables
      chat_rooms: {
        Row: ChatRoom;
        Insert: Omit<ChatRoom, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatRoom, 'id' | 'created_at'>>;
      };
      chat_room_members: {
        Row: ChatRoomMember;
        Insert: Omit<ChatRoomMember, 'id' | 'joined_at'>;
        Update: Partial<Omit<ChatRoomMember, 'id' | 'joined_at'>>;
      };
      room_messages: {
        Row: RoomMessage;
        Insert: Omit<RoomMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<RoomMessage, 'id' | 'created_at'>>;
      };
      message_reactions: {
        Row: MessageReaction;
        Insert: Omit<MessageReaction, 'id' | 'created_at'>;
        Update: Partial<Omit<MessageReaction, 'id' | 'created_at'>>;
      };
      typing_indicators: {
        Row: TypingIndicator;
        Insert: Omit<TypingIndicator, 'id' | 'updated_at'>;
        Update: Partial<Omit<TypingIndicator, 'id'>>;
      };
    };
  };
}

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
export type ChatRoomType = 'community' | 'dm' | 'group_dm';
export type WishStatus = 'private' | 'public' | 'fulfilled' | 'replaced';
export type QueenBeeStatus = 'upcoming' | 'active' | 'completed';
export type BoardPostStatus = 'active' | 'completed';

export interface QueenBeePreference extends Record<string, unknown> {
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
  | 'chat_mention'
  | 'wish_mention'
  | 'meeting_reminder';
export type ExtractionSource = 'chat' | 'onboarding' | 'meeting' | 'manual';

// Attachment type for photos/files in messages and posts
export interface Attachment extends Record<string, unknown> {
  id: string;
  url: string;
  filename: string;
  size: number;
  mime_type: string;
  width?: number;
  height?: number;
  duration_ms?: number;
}

export interface Community extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  slide_deck_url?: string;
  created_by?: string;
  created_at: string;
}

export interface CommunityMembership extends Record<string, unknown> {
  id: string;
  community_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  community?: Community;
  user?: Profile;
}

export interface CommunityInvite extends Record<string, unknown> {
  id: string;
  community_id: string;
  email: string;
  role: UserRole;
  invited_by?: string;
  token: string;
  expires_at?: string;
  accepted_at?: string;
  created_at: string;
  community?: Community;
  inviter?: Profile;
}

export interface Waitlist extends Record<string, unknown> {
  id: string;
  email: string;
  name?: string;
  message?: string;
  created_at: string;
}

export interface Profile extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferred_contact: string;
  birthday?: string;
  occupation?: string;
  profile_title?: string | null;
  role: UserRole;
  queen_bee_month?: string;
  queen_bee_preference?: QueenBeePreference;
  google_calendar_id?: string;
  google_refresh_token?: string;
  avatar_url?: string;
  push_token?: string;
  onboarded_at?: string;
  current_community_id?: string;
  bio?: string | null;
  current_project?: string | null;
  hometown?: string | null;
  favorite_book?: string | null;
  favorite_food?: string | null;
  favorite_hobby?: string | null;
  known_for?: string | null;
  miq_experiences?: string | null;
  miq_growth?: string | null;
  miq_contribution?: string | null;
  fun_facts?: string[] | null;
  love_languages?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Skill extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  description: string;
  raw_input?: string;
  extracted_from: ExtractionSource;
  enthusiasm_level?: number | null;
  display_x?: number | null;
  display_y?: number | null;
  created_at: string;
  user?: Profile;
}

export interface Wish extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  description: string;
  raw_input?: string;
  status: WishStatus;
  is_active: boolean;
  extracted_from: ExtractionSource;
  fulfilled_by?: string;
  thank_you_message?: string;
  board_category_id?: string | null;
  source_board_post_id?: string | null;
  created_at: string;
  fulfilled_at?: string;
  replaced_at?: string;
  user?: Profile;
  granters?: WishGranter[];
  board_category?: BoardCategory | null;
}

export interface WishComment extends Record<string, unknown> {
  id: string;
  wish_id: string;
  user_id: string;
  community_id: string;
  content: string;
  created_at: string;
  user?: Profile;
}

export interface WishGranter extends Record<string, unknown> {
  id: string;
  wish_id: string;
  granter_id: string;
  community_id: string;
  created_at: string;
  granter?: Profile;
}

export interface QueenBee extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  month: string;
  project_title: string;
  project_description?: string;
  status: QueenBeeStatus;
  display_order?: number;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface QueenBeeUpdate extends Record<string, unknown> {
  id: string;
  queen_bee_id: string;
  user_id: string;
  community_id: string;
  content: string;
  created_at: string;
  user?: Profile;
}

export interface MonthlyHighlight extends Record<string, unknown> {
  id: string;
  queen_bee_id: string;
  meeting_id?: string;
  community_id: string;
  highlight: string;
  display_order: number;
  created_by?: string;
  created_at: string;
  creator?: Profile;
}

export interface Meeting extends Record<string, unknown> {
  id: string;
  community_id: string;
  date: string;
  audio_url?: string;
  transcript_raw?: string;
  transcript_attributed?: string;
  summary?: string;
  recorded_by?: string;
  processing_status: 'pending' | 'transcribing' | 'summarizing' | 'complete' | 'failed';
  assemblyai_transcript_id?: string;
  linked_event_id?: string;
  created_at: string;
}

export interface ActionItem extends Record<string, unknown> {
  id: string;
  meeting_id?: string | null;
  community_id: string;
  description: string;
  assigned_to?: string;
  due_date?: string | null;
  completed: boolean;
  completed_at?: string | null;
  archived_at?: string | null;
  created_at: string;
  assigned_user?: Profile;
}

export interface HoneyPot extends Record<string, unknown> {
  id: string;
  community_id: string;
  balance: number;
  updated_by?: string;
  updated_at: string;
}

export interface HoneyPotTransaction extends Record<string, unknown> {
  id: string;
  community_id: string;
  amount: number;
  transaction_type: 'deposit' | 'withdrawal' | 'adjustment';
  note?: string | null;
  payment_method?: string | null;
  external_counterparty_name?: string | null;
  recorded_by?: string | null;
  related_user_id?: string | null;
  dues_year?: number | null;
  dues_quarter?: number | null;
  dues_covered_quarters?: number | null;
  created_at: string;
}

export type EventStatus = 'scheduled' | 'completed' | 'cancelled';

export interface Event extends Record<string, unknown> {
  id: string;
  community_id: string;
  title: string;
  description?: string;
  event_date: string;
  event_time?: string;
  event_type: EventType;
  google_event_id?: string;
  meet_link?: string;
  location?: string;
  status?: EventStatus;
  related_user_id?: string;
  related_queen_bee_id?: string;
  created_by?: string;
  created_at: string;
}

export interface DailyQuestionAnswer extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  question_index: number;
  question_date: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface Notification extends Record<string, unknown> {
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

export interface ContextSummary extends Record<string, unknown> {
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

export interface Conversation extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  project_id?: string | null;
  title: string | null;
  mode: ConversationMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationProject extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  conversation_id?: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[] | null;
  tool_calls?: Record<string, unknown>;
  created_at: string;
}

// ============================================
// MESSAGE BOARD TYPES
// ============================================

export interface BoardCategory extends Record<string, unknown> {
  id: string;
  community_id: string;
  name: string;
  description?: string;
  category_type: BoardCategoryType;
  topic_kind?: 'discussion' | 'hd_board' | 'helper_log';
  goal_title?: string | null;
  owner_user_id?: string | null;
  status?: 'active' | 'completed' | 'archived';
  completed_at?: string | null;
  completed_by?: string | null;
  completion_note?: string | null;
  source_wish_id?: string | null;
  icon?: string;
  audience?: 'community' | 'members';
  display_order: number;
  is_system: boolean;
  requires_admin: boolean;
  requires_approval: boolean;
  approved_at?: string;
  approved_by?: string;
  created_by?: string;
  created_at: string;
  member_tags?: BoardCategoryMemberTag[];
}

export interface AgentActionRequest extends Record<string, unknown> {
  id: string;
  community_id: string;
  user_id: string;
  conversation_id?: string | null;
  summary: string;
  action_plan: Record<string, unknown>[];
  status: 'pending' | 'applied' | 'cancelled' | 'failed';
  result?: Record<string, unknown> | null;
  created_at: string;
  applied_at?: string | null;
  cancelled_at?: string | null;
}

export interface BoardCategoryMemberTag extends Record<string, unknown> {
  id: string;
  community_id: string;
  category_id: string;
  tagged_user_id: string;
  tagged_by?: string;
  created_at: string;
  member?: Profile;
}

export interface BoardPost extends Record<string, unknown> {
  id: string;
  community_id: string;
  category_id: string;
  author_id: string;
  title: string;
  content: string;
  status?: BoardPostStatus;
  archived_at?: string | null;
  archived_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completion_note?: string | null;
  granted_wish_id?: string | null;
  attachments?: Attachment[] | null;
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

export interface BoardReply extends Record<string, unknown> {
  id: string;
  community_id: string;
  post_id: string;
  parent_reply_id?: string;
  author_id: string;
  content: string;
  attachments?: Attachment[] | null;
  edited_at?: string;
  created_at: string;
  // Joined data
  author?: Profile;
  reactions?: BoardReaction[];
  nested_replies?: BoardReply[];
}

export interface BoardReaction extends Record<string, unknown> {
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

export interface ChatRoom extends Record<string, unknown> {
  id: string;
  community_id: string;
  room_type: ChatRoomType;
  name?: string;
  description?: string;
  created_by?: string;
  created_at: string;
  custom_title?: string | null;
  custom_emoji?: string | null;
  custom_image_url?: string | null;
  custom_background?: string | null;
  custom_background_image_url?: string | null;
  // Computed/joined
  members?: ChatRoomMember[];
  last_message?: RoomMessage;
  unread_count?: number;
}

export interface ChatRoomMember extends Record<string, unknown> {
  id: string;
  room_id: string;
  user_id: string;
  last_read_at: string;
  muted: boolean;
  custom_title?: string | null;
  custom_emoji?: string | null;
  custom_image_url?: string | null;
  custom_background?: string | null;
  custom_background_image_url?: string | null;
  joined_at: string;
  user?: Profile;
}

export interface RoomMessage extends Record<string, unknown> {
  id: string;
  community_id: string;
  room_id: string;
  sender_id: string;
  content: string;
  attachments?: Attachment[] | null;
  edited_at?: string;
  deleted_at?: string;
  reply_to_id?: string;
  created_at: string;
  // Joined data
  sender?: Profile;
  reactions?: MessageReaction[];
  reply_to?: RoomMessage;
}

export interface MessageReaction extends Record<string, unknown> {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
}

export interface TypingIndicator extends Record<string, unknown> {
  id: string;
  room_id: string;
  user_id: string;
  updated_at: string;
  user?: Profile;
}

// ============================================
// USER INSIGHTS (AI-maintained personality profiles)
// ============================================

export interface UserInsights extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  personality_notes?: string;
  shared_with: string[];
  created_at: string;
  updated_at: string;
}

export interface ChatRoomsWithDataRow extends Record<string, unknown> {
  room_id: string;
  room_community_id: string;
  room_type: ChatRoomType;
  room_name: string | null;
  room_description: string | null;
  room_created_by: string | null;
  room_created_at: string;
  custom_title?: string | null;
  custom_emoji?: string | null;
  custom_image_url?: string | null;
  custom_background?: string | null;
  custom_background_image_url?: string | null;
  members: ChatRoomMember[];
  last_message: RoomMessage | null;
  unread_count: number;
}

export interface SurveyQuestion extends Record<string, unknown> {
  id: string;
  text: string;
  type: 'short' | 'long' | 'scale' | 'choice';
  options?: string[];
  required: boolean;
}

export interface Survey extends Record<string, unknown> {
  id: string;
  community_id: string;
  title: string;
  description?: string | null;
  questions: SurveyQuestion[];
  due_date?: string | null;
  meeting_id?: string | null;
  created_by?: string | null;
  created_at: string;
  is_active: boolean;
}

export interface SurveyResponse extends Record<string, unknown> {
  id: string;
  survey_id: string;
  user_id: string;
  community_id: string;
  answers: Record<string, string | string[] | number>;
  submitted_at: string;
}

export interface Database {
  public: {
    Tables: {
      communities: {
        Row: Community;
        Insert: Omit<Community, 'id' | 'created_at'>;
        Update: Partial<Omit<Community, 'id' | 'created_at'>>;
        Relationships: [];
      };
      community_memberships: {
        Row: CommunityMembership;
        Insert: Omit<CommunityMembership, 'id' | 'created_at'>;
        Update: Partial<Omit<CommunityMembership, 'id' | 'created_at'>>;
        Relationships: [];
      };
      community_invites: {
        Row: CommunityInvite;
        Insert: Omit<CommunityInvite, 'id' | 'created_at'>;
        Update: Partial<Omit<CommunityInvite, 'id' | 'created_at'>>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      skills: {
        Row: Skill;
        Insert: Omit<Skill, 'id' | 'created_at'>;
        Update: Partial<Omit<Skill, 'id' | 'created_at'>>;
        Relationships: [];
      };
      wishes: {
        Row: Wish;
        Insert: Omit<Wish, 'id' | 'created_at'>;
        Update: Partial<Omit<Wish, 'id' | 'created_at'>>;
        Relationships: [];
      };
      wish_comments: {
        Row: WishComment;
        Insert: Omit<WishComment, 'id' | 'created_at'>;
        Update: Partial<Omit<WishComment, 'id' | 'created_at'>>;
        Relationships: [];
      };
      wish_granters: {
        Row: WishGranter;
        Insert: Omit<WishGranter, 'id' | 'created_at'>;
        Update: Partial<Omit<WishGranter, 'id' | 'created_at'>>;
        Relationships: [];
      };
      queen_bees: {
        Row: QueenBee;
        Insert: Omit<QueenBee, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<QueenBee, 'id' | 'created_at'>>;
        Relationships: [];
      };
      queen_bee_updates: {
        Row: QueenBeeUpdate;
        Insert: Omit<QueenBeeUpdate, 'id' | 'created_at'>;
        Update: Partial<Omit<QueenBeeUpdate, 'id' | 'created_at'>>;
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Omit<Meeting, 'id' | 'created_at'>;
        Update: Partial<Omit<Meeting, 'id' | 'created_at'>>;
        Relationships: [];
      };
      monthly_highlights: {
        Row: MonthlyHighlight;
        Insert: Omit<MonthlyHighlight, 'id' | 'created_at'>;
        Update: Partial<Omit<MonthlyHighlight, 'id' | 'created_at'>>;
        Relationships: [];
      };
      action_items: {
        Row: ActionItem;
        Insert: Omit<ActionItem, 'id' | 'created_at'>;
        Update: Partial<Omit<ActionItem, 'id' | 'created_at'>>;
        Relationships: [];
      };
      honey_pot: {
        Row: HoneyPot;
        Insert: Omit<HoneyPot, 'id' | 'updated_at'>;
        Update: Partial<Omit<HoneyPot, 'id'>>;
        Relationships: [];
      };
      honey_pot_transactions: {
        Row: HoneyPotTransaction;
        Insert: Omit<HoneyPotTransaction, 'id' | 'created_at'>;
        Update: Partial<Omit<HoneyPotTransaction, 'id' | 'created_at'>>;
        Relationships: [];
      };
      events: {
        Row: Event;
        Insert: Omit<Event, 'id' | 'created_at'>;
        Update: Partial<Omit<Event, 'id' | 'created_at'>>;
        Relationships: [];
      };
      daily_question_answers: {
        Row: DailyQuestionAnswer;
        Insert: Omit<DailyQuestionAnswer, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DailyQuestionAnswer, 'id' | 'created_at'>>;
        Relationships: [];
      };
      surveys: {
        Row: Survey;
        Insert: Omit<Survey, 'id' | 'created_at'>;
        Update: Partial<Omit<Survey, 'id' | 'created_at'>>;
        Relationships: [];
      };
      survey_responses: {
        Row: SurveyResponse;
        Insert: Omit<SurveyResponse, 'id' | 'submitted_at'>;
        Update: Partial<Omit<SurveyResponse, 'id' | 'submitted_at'>>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatMessage, 'id' | 'created_at'>>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Conversation, 'id' | 'created_at'>>;
        Relationships: [];
      };
      conversation_projects: {
        Row: ConversationProject;
        Insert: Omit<ConversationProject, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ConversationProject, 'id' | 'created_at'>>;
        Relationships: [];
      };
      context_summaries: {
        Row: ContextSummary;
        Insert: Omit<ContextSummary, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ContextSummary, 'id' | 'created_at'>>;
        Relationships: [];
      };
      // Message Board tables
      board_categories: {
        Row: BoardCategory;
        Insert: Omit<BoardCategory, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardCategory, 'id' | 'created_at'>>;
        Relationships: [];
      };
      board_posts: {
        Row: BoardPost;
        Insert: Omit<BoardPost, 'id' | 'created_at' | 'reply_count'>;
        Update: Partial<Omit<BoardPost, 'id' | 'created_at'>>;
        Relationships: [];
      };
      board_replies: {
        Row: BoardReply;
        Insert: Omit<BoardReply, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardReply, 'id' | 'created_at'>>;
        Relationships: [];
      };
      board_reactions: {
        Row: BoardReaction;
        Insert: Omit<BoardReaction, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardReaction, 'id' | 'created_at'>>;
        Relationships: [];
      };
      board_category_member_tags: {
        Row: BoardCategoryMemberTag;
        Insert: Omit<BoardCategoryMemberTag, 'id' | 'created_at'>;
        Update: Partial<Omit<BoardCategoryMemberTag, 'id' | 'created_at'>>;
        Relationships: [];
      };
      // Intergroup Chat tables
      chat_rooms: {
        Row: ChatRoom;
        Insert: Omit<ChatRoom, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatRoom, 'id' | 'created_at'>>;
        Relationships: [];
      };
      chat_room_members: {
        Row: ChatRoomMember;
        Insert: Omit<ChatRoomMember, 'id' | 'joined_at'>;
        Update: Partial<Omit<ChatRoomMember, 'id' | 'joined_at'>>;
        Relationships: [];
      };
      room_messages: {
        Row: RoomMessage;
        Insert: Omit<RoomMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<RoomMessage, 'id' | 'created_at'>>;
        Relationships: [];
      };
      message_reactions: {
        Row: MessageReaction;
        Insert: Omit<MessageReaction, 'id' | 'created_at'>;
        Update: Partial<Omit<MessageReaction, 'id' | 'created_at'>>;
        Relationships: [];
      };
      typing_indicators: {
        Row: TypingIndicator;
        Insert: Omit<TypingIndicator, 'id' | 'updated_at'>;
        Update: Partial<Omit<TypingIndicator, 'id'>>;
        Relationships: [];
      };
      user_insights: {
        Row: UserInsights;
        Insert: Omit<UserInsights, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserInsights, 'id' | 'created_at'>>;
        Relationships: [];
      };
      waitlist: {
        Row: Waitlist;
        Insert: Omit<Waitlist, 'id' | 'created_at'>;
        Update: Partial<Omit<Waitlist, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      is_genesis_state: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_or_create_dm_room: {
        Args: {
          p_community_id: string;
          p_user1_id: string;
          p_user2_id: string;
        };
        Returns: string;
      };
      get_or_create_group_dm_room: {
        Args: {
          p_community_id: string;
          p_user_ids: string[];
        };
        Returns: string;
      };
      get_chat_rooms_with_data: {
        Args: {
          p_community_id: string;
          p_user_id: string;
        };
        Returns: ChatRoomsWithDataRow[];
      };
      record_honey_pot_transaction: {
        Args: {
          p_community_id: string;
          p_amount: number;
          p_transaction_type: 'deposit' | 'withdrawal' | 'adjustment';
          p_note?: string | null;
          p_payment_method?: string | null;
          p_external_counterparty_name?: string | null;
          p_related_user_id?: string | null;
          p_dues_year?: number | null;
          p_dues_quarter?: number | null;
          p_dues_covered_quarters?: number | null;
        };
        Returns: number;
      };
    };
  };
}

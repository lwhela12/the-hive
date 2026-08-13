export type UserRole = 'member' | 'treasurer' | 'admin';

// Board types
export type BoardCategoryType =
  | 'announcements'
  | 'general'
  | 'resources'
  | 'introductions'
  | 'custom';

// Chat types
export type ChatRoomType = 'community' | 'dm' | 'group_dm';
export type WishStatus = 'private' | 'public' | 'fulfilled' | 'replaced';
export type BoardPostStatus = 'active' | 'completed' | 'archived';

export type EventType = 'meeting' | 'birthday' | 'custom';
export type NotificationType =
  | 'wish_match'
  | 'meeting_summary'
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
  /**
   * Whether this HIVE runs a shared pot of money (migration 140). False shows
   * the explainer instead of an empty ledger — a fund that looks abandoned
   * reads as neglect, and Tech and Production never chose to have one.
   */
  honey_pot_enabled?: boolean;
  slide_deck_url?: string;
  /** Admin-editable Meeting Helper slide notes (migration 106). */
  meeting_helper_notes?: {
    news?: string;
    meetups?: string;
    wrapup?: string;
  } | null;
  /** Hex colour for this hive's header bar (migration 120). Null = honey gold. */
  accent_color?: string | null;
  /** How far anything in this HIVE may travel (migration 125). Defaults to 'hive'. */
  max_share_scope?: 'hive' | 'all_hives' | 'public';
  /** How often this HIVE meets — weekly HIVEs date their meetings rather than month them. */
  meeting_cadence?: 'monthly' | 'weekly';
  created_by?: string;
  created_at: string;
}

export interface CommunityMembership extends Record<string, unknown> {
  id: string;
  community_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  /** This HIVE's singular question, if it has one (migration 179) — e.g.
   *  Production HIVE's "what are your production goals?". Per membership,
   *  not per profile: a person's answer for one HIVE means nothing in
   *  another they also belong to. */
  hive_goal?: string | null;
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

/** Newsletter list for people outside the HIVEs (migration 123). */
export interface NewsletterSubscriber extends Record<string, unknown> {
  id: string;
  email: string;
  name?: string | null;
  source: string;
  token: string;
  unsubscribed_at?: string | null;
  created_at: string;
}

export interface Waitlist extends Record<string, unknown> {
  id: string;
  email: string;
  name?: string;
  message?: string;
  created_at: string;
  /**
   * The HIVE they asked about, as a slug, or null for "any / not sure"
   * (migration 168). A slug rather than a foreign key because the public
   * site writes here anonymously and must not need to read `communities`
   * to do it.
   */
  interested_in?: string | null;
  /** new -> invited -> joined | passed. Set by an owner in Admin. */
  status?: 'new' | 'invited' | 'joined' | 'passed';
  /** join-page, public-site, newsletter. */
  source?: string | null;
}

/**
 * One row per time an issue of The Buzz was mailed (migration 169).
 *
 * Its real job is stopping a second click mailing the whole list twice —
 * `send-newsletter` refuses a live send for an issue that already has one
 * unless it is told to mean it. Written only by that function on the service
 * role, which is why `Insert` is `never` here, the same shape `app_feedback`
 * uses.
 */
export interface NewsletterSend extends Record<string, unknown> {
  id: string;
  post_id: string;
  mode: 'test' | 'live';
  sent_by?: string | null;
  recipient_count: number;
  failed_count: number;
  created_at: string;
}

/**
 * The month's HIVE Focus (migration 135). One row with no community_id is THE
 * focus, chosen in OG HIVE and seen everywhere; a row naming a HIVE is that
 * HIVE's own and replaces it for them. No row means you follow everyone's.
 *
 * The standing invitation underneath it lives in lib/hiveFocus.ts, not here —
 * it never changes, and a line retyped monthly gets reworded monthly.
 */
export interface MonthlyFocus extends Record<string, unknown> {
  id: string;
  /** YYYY-MM. */
  month: string;
  /** null means every HIVE. */
  community_id: string | null;
  title: string;
  body: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A note about the app itself — not a wish, and not attached to a HIVE.
 * Written only by the app-feedback edge function (migration 138).
 */
export interface AppFeedback extends Record<string, unknown> {
  id: string;
  /** null once somebody deletes their profile; the report outlives them. */
  author_id: string | null;
  author_name: string | null;
  /** Where they were standing. null means HIVE-Wide, which is a real answer. */
  community_id: string | null;
  kind: 'bug' | 'idea' | 'confusing' | 'love';
  message: string;
  where_in_app: string | null;
  platform: string | null;
  status: 'new' | 'read' | 'done';
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
  /**
   * God level — Nat and Lucas. Distinct from being a community admin, who runs
   * one HIVE from the inside. Anything that speaks for a HIVE to the outside
   * world, or reads across HIVEs, asks this (migration 128).
   */
  is_owner?: boolean | null;
  google_calendar_id?: string;
  google_refresh_token?: string;
  avatar_url?: string;
  push_token?: string;
  email_reminders_enabled?: boolean | null;
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
  home_section_order?: string[] | null;
  home_shortcuts?: string[] | null;
  /** Read state that follows the person rather than the browser (migration 127). */
  app_news_seen_id?: string | null;
  /** Which version of the HIVE-Wide welcome this person has dismissed. */
  hive_wide_welcome_seen?: string | null;
  /**
   * How far this person travels, as opposed to what they write (migration 135).
   * 'hive': only people who share a HIVE with them can open their card.
   * 'all_hives': anyone in any HIVE can. Theirs to change, nobody else's.
   */
  profile_scope?: 'hive' | 'all_hives' | null;
  activity_read_ids?: Record<string, { at?: string; ids?: string[] }> | null;
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

/**
 * A sunflower a visitor left on someone else's skill bloom (migration 177).
 * One per person per bloom — leaving is an insert, taking it back is a delete.
 * The bloom's owner discovers them by looking at their garden; nothing pings.
 */
export interface SkillFlower extends Record<string, unknown> {
  id: string;
  skill_id: string;
  giver_id: string;
  created_at: string;
  giver?: Profile;
}

export interface Wish extends Record<string, unknown> {
  id: string;
  user_id: string;
  community_id: string;
  title?: string | null;
  description: string;
  raw_input?: string;
  status: WishStatus;
  /** How far this wish travels: hive | all_hives | public (migration 124). */
  share_scope?: 'hive' | 'all_hives' | 'public';
  is_active: boolean;
  /** Member-chosen "this month's HD". Unset = fall back to newest public. */
  is_spotlight?: boolean | null;
  extracted_from: ExtractionSource;
  fulfilled_by?: string;
  thank_you_message?: string;
  board_category_id?: string | null;
  /** Pictures and files that are part of the ask itself (migration 149). */
  attachments?: Attachment[] | null;
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
  attachments?: Attachment[] | null;
  parent_comment_id?: string | null;
  edited_at?: string | null;
  created_at: string;
  user?: Profile;
  reactions?: WishCommentReaction[];
}

export interface WishCommentReaction extends Record<string, unknown> {
  id: string;
  community_id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: ReactionUserProfile | null;
}

export interface WishGranter extends Record<string, unknown> {
  id: string;
  wish_id: string;
  granter_id: string;
  community_id: string;
  created_at: string;
  granter?: Profile;
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
  related_wish_id?: string | null;
  related_board_category_id?: string | null;
  related_user_id?: string | null;
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
  end_date?: string | null;
  event_time?: string;
  event_type: EventType;
  google_event_id?: string;
  meet_link?: string;
  location?: string;
  status?: EventStatus;
  related_user_id?: string;
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
  metadata?: Record<string, unknown> | null;
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
  /**
   * How far this board travels. 'hive' is the boards of the HIVE that owns the
   * row; 'all_hives' is a shared board on HIVE-Wide, read by every HIVE
   * whichever one created it. Mirrors `chat_rooms.reach` deliberately.
   *
   * The column has been live since the shared boards shipped; the type had
   * never caught up, so every screen reading it got `unknown` off the index
   * signature and had to cast.
   */
  reach?: 'hive' | 'all_hives';
  topic_kind?: 'discussion' | 'hd_board' | 'helper_log' | 'newsletter' | 'compliments';
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
  /** Standing reference threads sort to the bottom of their board. */
  is_anchored?: boolean;
  /**
   * 'members' keeps a thread inside the HIVE; 'public' shows it on the public
   * site. Only the monthly HIVE Help focus is read publicly today, so that
   * neighbours can drop off a donation without being members.
   */
  /**
   * Who can see that this event exists. The type had never caught up with
   * migration 125 and still said `members | public`, so every screen reading it
   * had to cast around the missing rung.
   */
  visibility?: 'members' | 'all_hives' | 'public';
  /**
   * Who is actually invited, and so who gets the address and the joining link
   * (migration 148). Never wider than `visibility`. Events written before that
   * migration have none, and for those the visibility was the invitation.
   */
  invited_scope?: 'members' | 'all_hives' | 'public';
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

export type ReactionUserProfile = Pick<Profile, 'id' | 'name'> & {
  avatar_url?: string | null;
};

export interface BoardReaction extends Record<string, unknown> {
  id: string;
  community_id: string;
  post_id?: string;
  reply_id?: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: ReactionUserProfile | null;
}

// ============================================
// INTERGROUP CHAT TYPES
// ============================================

export interface ChatRoom extends Record<string, unknown> {
  id: string;
  community_id: string;
  room_type: ChatRoomType;
  /**
   * How far the room reaches (migration 139). 'hive' is every room until now:
   * that HIVE's members only. 'all_hives' is the one room everybody shares —
   * hosted under OG because a row has to live somewhere, but open to any member
   * of any HIVE. Mirrors board_categories.reach deliberately.
   */
  reach?: 'hive' | 'all_hives';
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
  user?: ReactionUserProfile | null;
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
  /**
   * How far the room reaches. Added to this function's return by migration 153.
   * Its absence is what drew the HIVE-Wide room a second time under OG HIVE's
   * name — the rule that names rooms asks this question first.
   */
  room_reach: 'hive' | 'all_hives' | null;
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

/**
 * One row = this member has seen (or skipped) this HIVE's onboarding tour,
 * so it never shows again on any device (migration 167).
 */
export interface TourMark extends Record<string, unknown> {
  user_id: string;
  community_id: string;
  completed_at: string;
  outcome: 'finished' | 'skipped';
}

export interface Database {
  public: {
    Tables: {
      tour_marks: {
        Row: TourMark;
        Insert: Omit<TourMark, 'completed_at'>;
        Update: Partial<Omit<TourMark, 'completed_at'>>;
        Relationships: [];
      };
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
      skill_flowers: {
        Row: SkillFlower;
        Insert: Omit<SkillFlower, 'id' | 'created_at' | 'giver'>;
        Update: Partial<Omit<SkillFlower, 'id' | 'created_at' | 'giver'>>;
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
      wish_comment_reactions: {
        Row: WishCommentReaction;
        Insert: Omit<WishCommentReaction, 'id' | 'created_at'>;
        Update: Partial<Omit<WishCommentReaction, 'id' | 'created_at'>>;
        Relationships: [];
      };
      wish_granters: {
        Row: WishGranter;
        Insert: Omit<WishGranter, 'id' | 'created_at'>;
        Update: Partial<Omit<WishGranter, 'id' | 'created_at'>>;
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Omit<Meeting, 'id' | 'created_at'>;
        Update: Partial<Omit<Meeting, 'id' | 'created_at'>>;
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
      newsletter_subscribers: {
        Row: NewsletterSubscriber;
        Insert: Omit<NewsletterSubscriber, 'id' | 'created_at' | 'token'>;
        Update: Partial<Omit<NewsletterSubscriber, 'id' | 'created_at'>>;
        Relationships: [];
      };
      // Insert is deliberately `never`: only the send-newsletter function
      // writes here, on the service role, so a row is always a real send.
      newsletter_sends: {
        Row: NewsletterSend;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      monthly_focus: {
        Row: MonthlyFocus;
        Insert: Omit<MonthlyFocus, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MonthlyFocus, 'id' | 'created_at'>>;
        Relationships: [];
      };
      // Insert is deliberately `never`: the app cannot write here at all. The
      // table has no insert policy, and rows are made only by the app-feedback
      // edge function with the service key, so the author's name is always the
      // name on the JWT (migration 138).
      app_feedback: {
        Row: AppFeedback;
        Insert: never;
        Update: Partial<Pick<AppFeedback, 'status'>>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      is_genesis_state: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      subscribe_to_newsletter: {
        Args: { p_email: string; p_name?: string | null };
        Returns: undefined;
      };
      unsubscribe_from_newsletter: {
        Args: { p_token: string };
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
      // The HIVE-Wide calendar's narrow window (migration 176): every HIVE's
      // meeting days — never the Meet link, location or description.
      hive_wide_meeting_days: {
        Args: { from_date: string; to_date: string };
        Returns: {
          id: string;
          title: string | null;
          event_date: string;
          event_time: string | null;
          community_id: string;
        }[];
      };
    };
  };
}

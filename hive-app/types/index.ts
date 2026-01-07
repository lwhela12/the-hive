export type UserRole = 'member' | 'treasurer' | 'admin';
export type WishStatus = 'private' | 'public' | 'fulfilled' | 'replaced';
export type QueenBeeStatus = 'upcoming' | 'active' | 'completed';
export type EventType = 'meeting' | 'queen_bee' | 'birthday' | 'custom';
export type NotificationType = 'wish_match' | 'meeting_summary' | 'queen_bee_update' | 'action_item' | 'general';
export type ExtractionSource = 'chat' | 'onboarding' | 'meeting' | 'manual';

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferred_contact: string;
  birthday?: string;
  role: UserRole;
  queen_bee_month?: string;
  google_calendar_id?: string;
  google_refresh_token?: string;
  avatar_url?: string;
  onboarded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  user_id: string;
  description: string;
  raw_input?: string;
  extracted_from: ExtractionSource;
  created_at: string;
  user?: Profile;
}

export interface Wish {
  id: string;
  user_id: string;
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
  content: string;
  created_at: string;
  user?: Profile;
}

export interface Meeting {
  id: string;
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
  balance: number;
  updated_by?: string;
  updated_at: string;
}

export interface HoneyPotTransaction {
  id: string;
  amount: number;
  transaction_type: 'deposit' | 'withdrawal' | 'adjustment';
  note?: string;
  recorded_by?: string;
  created_at: string;
}

export interface Event {
  id: string;
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

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Record<string, unknown>;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
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
    };
  };
}

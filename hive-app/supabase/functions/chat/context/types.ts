// Context Builder Types for Smart LLM Context Management

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Summary types matching the database enum
export type ContextSummaryType = 'conversation' | 'board_activity' | 'room_messages' | 'meetings';

// Parameters for building context
export interface BuildContextParams {
  supabase: SupabaseClient;
  userId: string;
  communityId: string;
  conversationId?: string;
  mode: 'default' | 'onboarding';
}

// Result from building context
export interface ContextResult {
  assembledContext: string;
  recentMessages: MessageForContext[];
  metadata: ContextMetadata;
}

// Metadata about the context building process
export interface ContextMetadata {
  tokensUsed: number;
  conversationMessageCount: number;
  summariesUsed: ContextSummaryType[];
  cacheHits: ContextSummaryType[];
  cacheMisses: ContextSummaryType[];
}

// Message format for context
export interface MessageForContext {
  role: 'user' | 'assistant';
  content: string;
}

// User context data
export interface UserContextData {
  profile: ProfileData;
  skills: SkillData[];
  wishes: WishData[];
  actionItems: ActionItemData[];
}

// Community context data
export interface CommunityContextData {
  queenBee: QueenBeeData | null;
  honeyPot: number;
  upcomingEvents: EventData[];
  publicWishes: PublicWishData[];
  communitySkills: CommunitySkillData[];
}

// Simplified data types for context building
export interface ProfileData {
  name: string;
  email: string;
}

export interface SkillData {
  description: string;
}

export interface WishData {
  id: string;
  description: string;
  status: 'private' | 'public' | 'fulfilled' | 'replaced';
  is_active: boolean;
}

export interface ActionItemData {
  description: string;
  due_date?: string;
  completed: boolean;
}

export interface QueenBeeData {
  userName: string;
  month: string;
  projectTitle: string;
  projectDescription?: string;
  status: string;
}

export interface EventData {
  title: string;
  event_date: string;
  event_type: string;
}

export interface PublicWishData {
  userName: string;
  description: string;
}

export interface CommunitySkillData {
  userName: string;
  description: string;
}

// Cached summary record
export interface CachedSummary {
  id: string;
  summary_content: string;
  source_count: number;
  expires_at: string;
  estimated_tokens: number;
}

// Token budget configuration
export interface TokenBudget {
  systemPrompt: number;
  userContext: number;
  queenBee: number;
  publicWishesAndSkills: number;
  eventsAndHoneyPot: number;
  boardSummary: number;
  messagesSummary: number;
  meetingsSummary: number;
  conversationSummary: number;
  recentMessages: number;
}

// Default token budget
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  systemPrompt: 800,
  userContext: 400,
  queenBee: 150,
  publicWishesAndSkills: 400,
  eventsAndHoneyPot: 150,
  boardSummary: 200,
  messagesSummary: 150,
  meetingsSummary: 150,
  conversationSummary: 300,
  recentMessages: 1000,
};

// Cache expiration times (in milliseconds)
export const CACHE_EXPIRATION = {
  conversation: 0, // Invalidated by trigger on new message
  board_activity: 60 * 60 * 1000, // 1 hour
  room_messages: 60 * 60 * 1000, // 1 hour
  meetings: 24 * 60 * 60 * 1000, // 24 hours
};

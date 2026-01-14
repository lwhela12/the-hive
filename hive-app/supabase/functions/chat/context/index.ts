// Smart Context Builder for LLM Conversations
// Assembles comprehensive context from all user-visible data

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  BuildContextParams,
  ContextResult,
  ContextMetadata,
  MessageForContext,
  UserContextData,
  CommunityContextData,
  CachedSummary,
  ContextSummaryType,
} from './types.ts';
import {
  summarizeConversation,
  summarizeBoardActivity,
  summarizeRoomMessages,
  summarizeMeetings,
} from './summarizers.ts';

// Rough token estimation (1 token ~= 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Trim text to fit within token budget
function trimToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 20) + '... [truncated]';
}

// Check if a cached summary is still valid
function isCacheValid(summary: CachedSummary | null): boolean {
  if (!summary) return false;
  return new Date(summary.expires_at) > new Date();
}

/**
 * Main context builder function
 * Assembles all context the LLM needs to be aware of what the user sees
 */
export async function buildContext(params: BuildContextParams): Promise<ContextResult> {
  const { supabase, userId, communityId, conversationId, mode } = params;

  const metadata: ContextMetadata = {
    tokensUsed: 0,
    conversationMessageCount: 0,
    summariesUsed: [],
    cacheHits: [],
    cacheMisses: [],
  };

  // 1. Fetch user's direct context (always fresh - small data)
  const userContext = await fetchUserContext(supabase, userId, communityId);

  // 2. Fetch community context (always fresh - small data)
  const communityContext = await fetchCommunityContext(supabase, userId, communityId);

  // 3. Get conversation messages and handle summarization
  const { recentMessages, conversationSummary, messageCount } = await handleConversationHistory(
    supabase,
    userId,
    communityId,
    conversationId,
    metadata
  );
  metadata.conversationMessageCount = messageCount;

  // 4. Get cached summaries (hourly cache for board, messages, meetings)
  // Only fetch these for default mode (not onboarding)
  let boardSummary = '';
  let messagesSummary = '';
  let meetingsSummary = '';

  if (mode === 'default') {
    [boardSummary, messagesSummary, meetingsSummary] = await Promise.all([
      getOrGenerateSummary(supabase, communityId, userId, 'board_activity', metadata),
      getOrGenerateSummary(supabase, communityId, userId, 'room_messages', metadata),
      getOrGenerateSummary(supabase, communityId, userId, 'meetings', metadata),
    ]);
  }

  // 5. Assemble the final context string
  console.log('[Context] Community context public wishes count:', communityContext.publicWishes.length);
  console.log('[Context] Community context public wishes:', JSON.stringify(communityContext.publicWishes));

  const assembledContext = assembleContext({
    userContext,
    communityContext,
    conversationSummary,
    boardSummary,
    messagesSummary,
    meetingsSummary,
    mode,
  });

  // Log the public wishes section of assembled context
  if (assembledContext.includes('Active Public Wishes')) {
    const startIdx = assembledContext.indexOf('## Active Public Wishes');
    const endIdx = assembledContext.indexOf('##', startIdx + 5);
    const wishesSection = endIdx > startIdx
      ? assembledContext.slice(startIdx, endIdx)
      : assembledContext.slice(startIdx, startIdx + 500);
    console.log('[Context] Public wishes section in context:', wishesSection);
  } else {
    console.log('[Context] WARNING: No public wishes section in assembled context');
  }

  metadata.tokensUsed = estimateTokens(assembledContext);

  return {
    assembledContext,
    recentMessages,
    metadata,
  };
}

/**
 * Fetch user's personal context (skills, wishes, action items)
 */
async function fetchUserContext(
  supabase: SupabaseClient,
  userId: string,
  communityId: string
): Promise<UserContextData> {
  const [profileResult, skillsResult, wishesResult, actionItemsResult] = await Promise.all([
    supabase.from('profiles').select('name, email').eq('id', userId).single(),
    supabase.from('skills').select('description').eq('user_id', userId).eq('community_id', communityId),
    supabase
      .from('wishes')
      .select('id, description, status, is_active')
      .eq('user_id', userId)
      .eq('community_id', communityId),
    supabase
      .from('action_items')
      .select('description, due_date, completed')
      .eq('assigned_to', userId)
      .eq('community_id', communityId)
      .eq('completed', false)
      .order('due_date', { ascending: true })
      .limit(5),
  ]);

  return {
    profile: profileResult.data || { name: 'Unknown', email: '' },
    skills: skillsResult.data || [],
    wishes: wishesResult.data || [],
    actionItems: actionItemsResult.data || [],
  };
}

/**
 * Fetch community-wide context (Queen Bee, events, honey pot, public wishes, skills)
 */
async function fetchCommunityContext(
  supabase: SupabaseClient,
  userId: string,
  communityId: string
): Promise<CommunityContextData> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [queenBeeResult, honeyPotResult, eventsResult, publicWishesResult, skillsResult] = await Promise.all([
    supabase
      .from('queen_bees')
      .select('month, project_title, project_description, status, user:profiles(name)')
      .eq('month', currentMonth)
      .eq('community_id', communityId)
      .single(),
    supabase.from('honey_pot').select('balance').eq('community_id', communityId).single(),
    supabase
      .from('events')
      .select('title, event_date, event_type')
      .eq('community_id', communityId)
      .gte('event_date', new Date().toISOString().slice(0, 10))
      .lte('event_date', nextWeek.toISOString().slice(0, 10))
      .order('event_date', { ascending: true })
      .limit(5),
    supabase
      .from('wishes')
      .select('description, user_id, user:profiles!wishes_user_id_fkey(name)')
      .eq('community_id', communityId)
      .eq('status', 'public')
      .eq('is_active', true)
      .limit(10),
    supabase
      .from('skills')
      .select('description, user:profiles(name)')
      .eq('community_id', communityId)
      .neq('user_id', userId)
      .limit(20),
  ]);

  // Debug logging for public wishes
  console.log('[Context] Community ID:', communityId);
  console.log('[Context] Public wishes query result:', JSON.stringify(publicWishesResult));
  if (publicWishesResult.error) {
    console.error('[Context] Public wishes error:', publicWishesResult.error);
  }

  return {
    queenBee: queenBeeResult.data
      ? {
          userName: (queenBeeResult.data.user as any)?.name || 'Unknown',
          month: queenBeeResult.data.month,
          projectTitle: queenBeeResult.data.project_title,
          projectDescription: queenBeeResult.data.project_description,
          status: queenBeeResult.data.status,
        }
      : null,
    honeyPot: honeyPotResult.data?.balance || 0,
    upcomingEvents: eventsResult.data || [],
    publicWishes: (publicWishesResult.data || []).map((w: any) => ({
      userName: w.user?.name || 'Unknown',
      description: w.description,
      isCurrentUser: w.user_id === userId,
    })),
    communitySkills: (skillsResult.data || []).map((s: any) => ({
      userName: s.user?.name || 'Unknown',
      description: s.description,
    })),
  };
}

/**
 * Handle conversation history with summarization for long conversations
 */
async function handleConversationHistory(
  supabase: SupabaseClient,
  userId: string,
  communityId: string,
  conversationId: string | undefined,
  metadata: ContextMetadata
): Promise<{
  recentMessages: MessageForContext[];
  conversationSummary: string;
  messageCount: number;
}> {
  // Build the query for messages
  let query = supabase.from('chat_messages').select('role, content, created_at').eq('user_id', userId);

  if (conversationId) {
    query = query.eq('conversation_id', conversationId);
  } else {
    query = query.eq('community_id', communityId);
  }

  // Get total count
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq(conversationId ? 'conversation_id' : 'community_id', conversationId || communityId);

  const messageCount = count || 0;

  // If 20 or fewer messages, return all
  if (messageCount <= 20) {
    const { data: messages } = await query.order('created_at', { ascending: true }).limit(20);

    return {
      recentMessages: (messages || []).map((m) => ({ role: m.role, content: m.content })),
      conversationSummary: '',
      messageCount,
    };
  }

  // More than 20 messages - need to summarize older ones
  // Get the last 10 messages verbatim
  const { data: recentMessages } = await query.order('created_at', { ascending: false }).limit(10);

  // Check for existing summary
  let conversationSummary = '';
  if (conversationId) {
    conversationSummary = await getOrGenerateConversationSummary(
      supabase,
      communityId,
      userId,
      conversationId,
      messageCount,
      metadata
    );
  }

  return {
    recentMessages: (recentMessages || []).reverse().map((m) => ({ role: m.role, content: m.content })),
    conversationSummary,
    messageCount,
  };
}

/**
 * Get or generate a conversation summary
 */
async function getOrGenerateConversationSummary(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  conversationId: string,
  messageCount: number,
  metadata: ContextMetadata
): Promise<string> {
  // Check for cached summary
  const { data: cached } = await supabase
    .from('context_summaries')
    .select('summary_content, source_count, expires_at')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .eq('summary_type', 'conversation')
    .single();

  if (cached && isCacheValid(cached)) {
    metadata.cacheHits.push('conversation');
    return cached.summary_content;
  }

  metadata.cacheMisses.push('conversation');

  // Need to generate summary - get older messages (exclude last 10)
  const { data: olderMessages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(messageCount - 10);

  if (!olderMessages || olderMessages.length === 0) {
    return '';
  }

  // Generate summary using Claude
  const summary = await summarizeConversation(olderMessages);
  metadata.summariesUsed.push('conversation');

  // Cache the summary (expires when new message added via trigger)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour fallback

  await supabase.from('context_summaries').upsert(
    {
      community_id: communityId,
      user_id: userId,
      conversation_id: conversationId,
      summary_type: 'conversation',
      summary_content: summary,
      source_count: olderMessages.length,
      last_source_timestamp: new Date().toISOString(),
      estimated_tokens: estimateTokens(summary),
      expires_at: expiresAt.toISOString(),
    },
    {
      onConflict: 'community_id,user_id,summary_type,conversation_id',
    }
  );

  return summary;
}

/**
 * Get or generate a cached summary (board, messages, meetings)
 */
async function getOrGenerateSummary(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  summaryType: ContextSummaryType,
  metadata: ContextMetadata
): Promise<string> {
  // Check for cached summary
  const { data: cached } = await supabase
    .from('context_summaries')
    .select('summary_content, expires_at')
    .eq('community_id', communityId)
    .eq('user_id', summaryType === 'room_messages' ? userId : null)
    .eq('summary_type', summaryType)
    .is('conversation_id', null)
    .single();

  if (cached && isCacheValid(cached)) {
    metadata.cacheHits.push(summaryType);
    return cached.summary_content;
  }

  metadata.cacheMisses.push(summaryType);

  // Generate new summary
  let summary = '';
  let sourceCount = 0;

  switch (summaryType) {
    case 'board_activity': {
      const result = await summarizeBoardActivity(supabase, communityId);
      summary = result.summary;
      sourceCount = result.count;
      break;
    }
    case 'room_messages': {
      const result = await summarizeRoomMessages(supabase, communityId, userId);
      summary = result.summary;
      sourceCount = result.count;
      break;
    }
    case 'meetings': {
      const result = await summarizeMeetings(supabase, communityId, userId);
      summary = result.summary;
      sourceCount = result.count;
      break;
    }
  }

  if (summary) {
    metadata.summariesUsed.push(summaryType);

    // Cache expiration: 1 hour for board/messages, 24 hours for meetings
    const expiresAt = new Date();
    if (summaryType === 'meetings') {
      expiresAt.setHours(expiresAt.getHours() + 24);
    } else {
      expiresAt.setHours(expiresAt.getHours() + 1);
    }

    await supabase.from('context_summaries').upsert(
      {
        community_id: communityId,
        user_id: summaryType === 'room_messages' ? userId : null,
        summary_type: summaryType,
        conversation_id: null,
        summary_content: summary,
        source_count: sourceCount,
        last_source_timestamp: new Date().toISOString(),
        estimated_tokens: estimateTokens(summary),
        expires_at: expiresAt.toISOString(),
      },
      {
        onConflict: 'community_id,user_id,summary_type,conversation_id',
      }
    );
  }

  return summary;
}

/**
 * Assemble all context into a single formatted string
 */
function assembleContext(data: {
  userContext: UserContextData;
  communityContext: CommunityContextData;
  conversationSummary: string;
  boardSummary: string;
  messagesSummary: string;
  meetingsSummary: string;
  mode: 'default' | 'onboarding';
}): string {
  const sections: string[] = [];

  // User Context
  const userSkills =
    data.userContext.skills.map((s) => `- ${s.description}`).join('\n') || 'None recorded yet';
  const userWishes =
    data.userContext.wishes
      .map((w) => `- [${w.status.toUpperCase()}${w.is_active ? ', ACTIVE' : ''}] ${w.description}`)
      .join('\n') || 'None recorded yet';
  const actionItems =
    data.userContext.actionItems
      .map((a) => `- ${a.completed ? '[DONE]' : '[TODO]'} ${a.description}${a.due_date ? ` (due: ${a.due_date})` : ''}`)
      .join('\n') || 'None';

  sections.push(`## About You
Name: ${data.userContext.profile.name}

### Your Skills
${userSkills}

### Your Wishes
${userWishes}

### Your Action Items
${actionItems}`);

  // Community Context (skip for onboarding)
  if (data.mode === 'default') {
    // Queen Bee
    if (data.communityContext.queenBee) {
      const qb = data.communityContext.queenBee;
      sections.push(`## Current Queen Bee (${qb.month}): ${qb.userName}
**Project:** ${qb.projectTitle}
${qb.projectDescription || ''}
Status: ${qb.status}`);
    }

    // Public wishes (including user's own)
    if (data.communityContext.publicWishes.length > 0) {
      const wishes = data.communityContext.publicWishes
        .map((w) => {
          const marker = w.isCurrentUser ? ' (YOUR WISH)' : '';
          return `- ${w.userName}${marker}: ${w.description}`;
        })
        .join('\n');
      sections.push(`## Active Public Wishes in the HIVE
${wishes}`);
    }

    // Community skills
    if (data.communityContext.communitySkills.length > 0) {
      const skills = data.communityContext.communitySkills
        .map((s) => `- ${s.userName}: ${s.description}`)
        .join('\n');
      sections.push(`## Community Skills
${skills}`);
    }

    // Events and Honey Pot
    const events =
      data.communityContext.upcomingEvents.map((e) => `- ${e.event_date}: ${e.title}`).join('\n') ||
      'No upcoming events';
    sections.push(`## Community State
Honey Pot: $${data.communityContext.honeyPot.toFixed(2)}

### Upcoming Events (Next 7 Days)
${events}`);

    // Cached summaries (only include if we have content)
    if (data.boardSummary) {
      sections.push(`## Recent Board Activity
${data.boardSummary}`);
    }

    if (data.messagesSummary) {
      sections.push(`## Recent Chat Activity
${data.messagesSummary}`);
    }

    if (data.meetingsSummary) {
      sections.push(`## Recent Meeting Notes
${data.meetingsSummary}`);
    }
  }

  // Conversation summary (if conversation is long)
  if (data.conversationSummary) {
    sections.push(`## Earlier in This Conversation
${data.conversationSummary}`);
  }

  return sections.join('\n\n---\n\n');
}

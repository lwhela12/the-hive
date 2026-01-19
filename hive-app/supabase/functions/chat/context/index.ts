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
  BoardPostIndexItem,
  RecentRoomMessage,
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

  // 4. Get cached summaries, board post index, and recent room messages (only for default mode)
  let boardSummary = '';
  let messagesSummary = '';
  let meetingsSummary = '';
  let boardPostIndex: BoardPostIndexItem[] = [];
  let recentRoomMessages: RecentRoomMessage[] = [];

  if (mode === 'default') {
    // Fetch summaries, board post index, and recent room messages in parallel
    const [boardSummaryResult, messagesSummaryResult, meetingsSummaryResult, boardIndexResult, roomMessagesResult] = await Promise.all([
      getOrGenerateSummary(supabase, communityId, userId, 'board_activity', metadata),
      getOrGenerateSummary(supabase, communityId, userId, 'room_messages', metadata),
      getOrGenerateSummary(supabase, communityId, userId, 'meetings', metadata),
      fetchBoardPostIndex(supabase, communityId),
      fetchRecentRoomMessages(supabase, userId, communityId),
    ]);
    boardSummary = boardSummaryResult;
    messagesSummary = messagesSummaryResult;
    meetingsSummary = meetingsSummaryResult;
    boardPostIndex = boardIndexResult;
    recentRoomMessages = roomMessagesResult;
  }

  // 5. Assemble the final context string
  console.log('[Context] Community context public wishes count:', communityContext.publicWishes.length);
  console.log('[Context] Community context public wishes:', JSON.stringify(communityContext.publicWishes));

  const assembledContext = assembleContext({
    userContext,
    communityContext,
    conversationSummary,
    boardPostIndex,
    recentRoomMessages,
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
 * Fetch recent room messages that the user can see
 * Returns raw messages from rooms the user is a member of (last 3 days)
 */
async function fetchRecentRoomMessages(
  supabase: SupabaseClient,
  userId: string,
  communityId: string
): Promise<RecentRoomMessage[]> {
  // Get rooms the user is a member of
  const { data: memberships } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', userId);

  if (!memberships || memberships.length === 0) {
    console.log('[Context] User has no room memberships');
    return [];
  }

  const roomIds = memberships.map((m) => m.room_id);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  console.log('[Context] Fetching room messages for user from', roomIds.length, 'rooms');

  // Get recent messages from these rooms
  const { data: messages, error } = await supabase
    .from('room_messages')
    .select(`
      content,
      created_at,
      room:chat_rooms(name, room_type),
      sender:profiles(name)
    `)
    .in('room_id', roomIds)
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .gte('created_at', threeDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[Context] Error fetching room messages:', error);
    return [];
  }

  if (!messages || messages.length === 0) {
    console.log('[Context] No recent room messages found');
    return [];
  }

  console.log('[Context] Found', messages.length, 'recent room messages');

  return messages.map((m: any) => ({
    roomName: m.room?.name || (m.room?.room_type === 'dm' ? 'DM' : 'Chat'),
    roomType: m.room?.room_type || 'community',
    senderName: m.sender?.name || 'Unknown',
    content: m.content,
    createdAt: m.created_at,
  }));
}

/**
 * Fetch recent board posts as a structured index for quick reference
 * Returns up to 15 recent posts with key metadata (no full content)
 */
async function fetchBoardPostIndex(
  supabase: SupabaseClient,
  communityId: string
): Promise<BoardPostIndexItem[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  console.log('[Context] Fetching board post index for community:', communityId);
  console.log('[Context] Date filter - posts since:', fourteenDaysAgo.toISOString());

  const { data: posts, error } = await supabase
    .from('board_posts')
    .select(`
      id,
      title,
      is_pinned,
      reply_count,
      created_at,
      category:board_categories(name),
      author:profiles!board_posts_author_id_fkey(name)
    `)
    .eq('community_id', communityId)
    .gte('created_at', fourteenDaysAgo.toISOString())
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) {
    console.error('[Context] Error fetching board post index:', error);
    return [];
  }

  console.log('[Context] Board post index query returned', posts?.length || 0, 'posts');

  if (!posts || posts.length === 0) {
    // Try without date filter to see if posts exist at all
    const { data: allPosts, count } = await supabase
      .from('board_posts')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId);
    console.log('[Context] Total board posts in community (no date filter):', count);
    return [];
  }

  const result = posts.map((p: any) => ({
    id: p.id,
    title: p.title,
    category: p.category?.name || 'General',
    author: p.author?.name || 'Unknown',
    reply_count: p.reply_count || 0,
    is_pinned: p.is_pinned || false,
    created_at: p.created_at,
  }));

  console.log('[Context] Board post index items:', JSON.stringify(result.map(r => ({ id: r.id, title: r.title }))));

  return result;
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
  boardPostIndex: BoardPostIndexItem[];
  recentRoomMessages: RecentRoomMessage[];
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

    // Board post index (structured data for reference)
    console.log('[Context] assembleContext - boardPostIndex length:', data.boardPostIndex.length);
    if (data.boardPostIndex.length > 0) {
      const postIndex = data.boardPostIndex.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        author: p.author,
        replies: p.reply_count,
        pinned: p.is_pinned,
      }));
      sections.push(`## Board Posts Index (use get_board_post tool to see full content)
\`\`\`json
${JSON.stringify(postIndex, null, 2)}
\`\`\``);
      console.log('[Context] Board post index added to context');
    } else {
      console.log('[Context] No board posts to add to context');
    }

    // Recent room messages (raw messages from last 3 days for detail)
    if (data.recentRoomMessages.length > 0) {
      // Group messages by room
      const messagesByRoom: Record<string, string[]> = {};
      for (const msg of data.recentRoomMessages) {
        const roomKey = msg.roomName;
        if (!messagesByRoom[roomKey]) {
          messagesByRoom[roomKey] = [];
        }
        // Format: "Name: message content (timestamp)"
        const timeStr = new Date(msg.createdAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        messagesByRoom[roomKey].push(`${msg.senderName}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''} (${timeStr})`);
      }

      const formattedRoomMessages = Object.entries(messagesByRoom)
        .map(([room, msgs]) => `### ${room}\n${msgs.join('\n')}`)
        .join('\n\n');

      sections.push(`## Recent Conversations (Last 3 Days)
${formattedRoomMessages}`);
      console.log('[Context] Added', data.recentRoomMessages.length, 'recent room messages to context');
    }

    // Cached summaries (only include if we have content)
    if (data.boardSummary) {
      sections.push(`## Recent Board Activity Summary
${data.boardSummary}`);
    }

    if (data.messagesSummary) {
      sections.push(`## Chat Activity Summary (Last 7 Days)
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

// Claude-Powered Summarizers for Smart Context Management
// Generates concise summaries of conversations, board activity, messages, and meetings

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Initialize Anthropic client (will be created on first use)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  }
  return anthropicClient;
}

/**
 * Summarize conversation messages for context preservation
 * Used when conversations exceed 20 messages
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  if (messages.length === 0) return '';

  const formattedMessages = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Summarize this conversation between a user and an AI assistant in the HIVE app.

The HIVE helps a 12-person community practice "high-definition wishing" - refining vague desires into specific, actionable wishes, and matching them with community members' skills.

Summarize to preserve:
1. Key topics discussed
2. Any wishes mentioned (note if private/public/fulfilled)
3. Any skills the user mentioned having
4. Decisions made or preferences expressed
5. The emotional tone/context
6. Any action items or follow-ups

Keep the summary under 200 words. Use bullet points for clarity.

Conversation:
${formattedMessages}

Summary:`;

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return textBlock?.text || '';
  } catch (error) {
    console.error('Error summarizing conversation:', error);
    return '';
  }
}

/**
 * Summarize recent board activity
 * Returns summary of posts and discussions from the last 7 days
 */
export async function summarizeBoardActivity(
  supabase: SupabaseClient,
  communityId: string
): Promise<{ summary: string; count: number }> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Fetch recent posts with categories and reply counts
  const { data: posts } = await supabase
    .from('board_posts')
    .select(
      `
      title,
      content,
      is_pinned,
      reply_count,
      created_at,
      category:board_categories(name, category_type),
      author:profiles(name)
    `
    )
    .eq('community_id', communityId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(15);

  if (!posts || posts.length === 0) {
    return { summary: '', count: 0 };
  }

  // Format posts for summarization
  const formattedPosts = posts
    .map((p: any) => {
      const pinned = p.is_pinned ? '[PINNED] ' : '';
      const category = p.category?.name || 'General';
      const replies = p.reply_count > 0 ? ` (${p.reply_count} replies)` : '';
      return `${pinned}[${category}] "${p.title}" by ${p.author?.name || 'Unknown'}${replies}`;
    })
    .join('\n');

  const prompt = `Summarize this recent message board activity for the HIVE community.

Include:
1. Hot topics being discussed
2. Any announcements (especially pinned posts)
3. Queen Bee project updates
4. Questions that might need answers
5. Resources shared

Keep summary under 150 words. Be concise.

Recent board activity:
${formattedPosts}

Summary:`;

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return { summary: textBlock?.text || '', count: posts.length };
  } catch (error) {
    console.error('Error summarizing board activity:', error);
    return { summary: '', count: 0 };
  }
}

/**
 * Summarize recent human-to-human chat messages
 * Focuses on rooms the user is a member of
 */
export async function summarizeRoomMessages(
  supabase: SupabaseClient,
  communityId: string,
  userId: string
): Promise<{ summary: string; count: number }> {
  // Get rooms the user is a member of
  const { data: memberships } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', userId);

  if (!memberships || memberships.length === 0) {
    return { summary: '', count: 0 };
  }

  const roomIds = memberships.map((m) => m.room_id);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  // Get recent messages from these rooms
  const { data: messages } = await supabase
    .from('room_messages')
    .select(
      `
      content,
      created_at,
      room:chat_rooms(name, room_type),
      sender:profiles(name)
    `
    )
    .in('room_id', roomIds)
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .gte('created_at', oneDayAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(30);

  if (!messages || messages.length === 0) {
    return { summary: '', count: 0 };
  }

  // Group by room and format
  const roomGroups: Record<string, string[]> = {};
  messages.forEach((m: any) => {
    const roomName = m.room?.name || (m.room?.room_type === 'dm' ? 'DM' : 'Unknown');
    if (!roomGroups[roomName]) {
      roomGroups[roomName] = [];
    }
    roomGroups[roomName].push(`${m.sender?.name || 'Unknown'}: ${m.content.slice(0, 100)}`);
  });

  const formattedMessages = Object.entries(roomGroups)
    .map(([room, msgs]) => `[${room}]\n${msgs.slice(0, 5).join('\n')}`)
    .join('\n\n');

  const prompt = `Summarize recent chat activity in the HIVE community chat rooms.

For community rooms: Summarize main discussion topics and any important info.
For DMs: Just note who the user has been chatting with and general topics (no private details).

Keep summary under 100 words. Be brief.

Recent chat activity:
${formattedMessages}

Summary:`;

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return { summary: textBlock?.text || '', count: messages.length };
  } catch (error) {
    console.error('Error summarizing room messages:', error);
    return { summary: '', count: 0 };
  }
}

/**
 * Summarize recent meetings and action items
 */
export async function summarizeMeetings(
  supabase: SupabaseClient,
  communityId: string,
  userId: string
): Promise<{ summary: string; count: number }> {
  // Get recent completed meetings
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: meetings } = await supabase
    .from('meetings')
    .select('date, summary')
    .eq('community_id', communityId)
    .eq('processing_status', 'complete')
    .gte('date', thirtyDaysAgo.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(3);

  // Get user's action items
  const { data: actionItems } = await supabase
    .from('action_items')
    .select('description, due_date, completed')
    .eq('community_id', communityId)
    .eq('assigned_to', userId)
    .eq('completed', false)
    .order('due_date', { ascending: true })
    .limit(5);

  if ((!meetings || meetings.length === 0) && (!actionItems || actionItems.length === 0)) {
    return { summary: '', count: 0 };
  }

  // Format meetings
  const meetingSummaries = (meetings || [])
    .map((m: any) => `${m.date}: ${m.summary?.slice(0, 200) || 'No summary available'}`)
    .join('\n\n');

  // Format action items
  const actionItemsList = (actionItems || [])
    .map((a) => `- ${a.description}${a.due_date ? ` (due: ${a.due_date})` : ''}`)
    .join('\n');

  const prompt = `Summarize recent meeting activity for the HIVE community.

Include:
1. Key points from recent meetings
2. Outstanding action items for this user
3. Important decisions made

Keep summary under 120 words.

Recent meetings:
${meetingSummaries || 'No recent meetings'}

Your action items:
${actionItemsList || 'No outstanding action items'}

Summary:`;

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return {
      summary: textBlock?.text || '',
      count: (meetings?.length || 0) + (actionItems?.length || 0),
    };
  } catch (error) {
    console.error('Error summarizing meetings:', error);
    return { summary: '', count: 0 };
  }
}

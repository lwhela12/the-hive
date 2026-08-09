// Claude-Powered Summarizers for Smart Context Management
// Generates concise summaries of conversations, board activity, and meetings.

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

  const prompt = `Summarize this conversation between a user and an AI assistant in HIVE app.

H.I.V.E. (Human Insight Vision Execution) helps a 12-person community practice "high-definition wishing" - refining vague desires into specific, actionable wishes, and matching them with community members' skills.

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
      category:board_categories(name, category_type, topic_kind, goal_title, status, owner:profiles!board_categories_owner_user_id_fkey(name)),
      author:profiles!board_posts_author_id_fkey(name)
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
      const status = p.category?.status && p.category.status !== 'active'
        ? ` ${p.category.status}`
        : '';
      const boardType = p.category?.topic_kind === 'hd_board'
        ? ` HD${status} for ${p.category?.owner?.name || 'member'}${p.category?.goal_title ? `: ${p.category.goal_title}` : ''}`
        : p.category?.topic_kind === 'helper_log' ? ` Helper log${status}` : status;
      const replies = p.reply_count > 0 ? ` (${p.reply_count} replies)` : '';
      return `${pinned}[${category}${boardType}] "${p.title}" by ${p.author?.name || 'Unknown'}${replies}`;
    })
    .join('\n');

  const prompt = `Summarize this recent message board activity for HIVE community.

Include:
1. Hot topics being discussed
2. Any announcements (especially pinned posts)
3. Questions that might need answers
4. Resources shared

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

  const prompt = `Summarize recent meeting activity for HIVE community.

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

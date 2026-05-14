import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface ApplyMeetingNotesRequest {
  meetingId: string;
}

interface Member {
  id: string;
  name: string;
}

interface MeetingAnalysis {
  title?: string;
  summary?: string;
  decisions?: string[];
  details?: string[];
  action_items?: Array<{
    description: string;
    assigned_to_name?: string | null;
    due_date?: string | null;
  }>;
  events?: Array<{
    title: string;
    event_date: string;
    event_time?: string | null;
    event_type?: 'meeting' | 'custom';
    description?: string | null;
    location?: string | null;
  }>;
  wishes_surfaced?: Array<{
    person_name: string;
    description: string;
  }>;
  queen_bee_highlights?: string[];
  board_suggestions?: Array<{
    person_name?: string | null;
    title: string;
    content: string;
    category_hint?: string | null;
  }>;
}

function isIsoDate(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*\n?/i, '')
    .replace(/^```\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

function parseJsonText(text: string): Record<string, any> {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Model did not return JSON');
  }
}

function parseMeetingSummary(summary?: string | null): Record<string, any> {
  if (!summary) return {};
  try {
    const parsed = JSON.parse(summary);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return { summary };
  }
}

function matchMemberByName(name: string | null | undefined, members: Member[]) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  if (!normalized || normalized === 'the group' || normalized === 'group') return null;

  const exact = members.find((member) => member.name.toLowerCase() === normalized);
  if (exact) return exact.id;

  const partial = members.find((member) => {
    const memberName = member.name.toLowerCase();
    return memberName.includes(normalized) || normalized.includes(memberName);
  });

  return partial?.id ?? null;
}

async function findBoardCategory(
  supabaseAdmin: any,
  communityId: string,
  suggestion: { person_name?: string | null; category_hint?: string | null },
  members: Member[]
) {
  const targetMemberId = matchMemberByName(suggestion.person_name, members);

  if (targetMemberId) {
    const { data: tags } = await supabaseAdmin
      .from('board_category_member_tags')
      .select('category_id')
      .eq('community_id', communityId)
      .eq('tagged_user_id', targetMemberId);

    const categoryIds = tags?.map((tag: { category_id: string }) => tag.category_id) ?? [];
    if (categoryIds.length > 0) {
      const { data: categories } = await supabaseAdmin
        .from('board_categories')
        .select('id, name, is_system')
        .in('id', categoryIds)
        .eq('community_id', communityId)
        .order('is_system', { ascending: true })
        .order('created_at', { ascending: true });

      if (categories?.[0]?.id) return categories[0].id;
    }
  }

  const categoryHint = suggestion.category_hint?.trim();
  if (categoryHint) {
    const { data: hintedCategory } = await supabaseAdmin
      .from('board_categories')
      .select('id')
      .eq('community_id', communityId)
      .ilike('name', `%${categoryHint}%`)
      .limit(1)
      .maybeSingle();

    if (hintedCategory?.id) return hintedCategory.id;
  }

  const { data: resourcesCategory } = await supabaseAdmin
    .from('board_categories')
    .select('id')
    .eq('community_id', communityId)
    .ilike('name', 'Resources')
    .limit(1)
    .maybeSingle();

  if (resourcesCategory?.id) return resourcesCategory.id;

  const { data: fallbackCategory } = await supabaseAdmin
    .from('board_categories')
    .select('id')
    .eq('community_id', communityId)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  return fallbackCategory?.id ?? null;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const auth = await verifySupabaseJwt(req.headers.get('Authorization') ?? req.headers.get('authorization'));
  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const { userId, token } = auth;

  try {
    const body = (await req.json()) as ApplyMeetingNotesRequest;
    if (!body.meetingId) {
      return errorResponse('Missing meetingId', 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          },
        },
      }
    );

    const { data: meeting, error: meetingError } = await supabaseUser
      .from('meetings')
      .select('*')
      .eq('id', body.meetingId)
      .single();

    if (meetingError || !meeting) {
      return errorResponse('Meeting not found', 404);
    }

    const communityId = meeting.community_id;
    const { data: membership } = await supabaseUser
      .from('community_memberships')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return errorResponse('Community membership required', 403);
    }

    const existingSummary = parseMeetingSummary(meeting.summary);

    const { data: memberRows } = await supabaseAdmin
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', communityId);

    const memberIds = memberRows?.map((row: { user_id: string }) => row.user_id) ?? [];
    const { data: members } = memberIds.length
      ? await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .in('id', memberIds)
      : { data: [] as Member[] };

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const memberNames = (members ?? []).map((member: Member) => member.name).join(', ');
    const sourceFile = existingSummary.imported_file;
    const content: any[] = [
      {
        type: 'text',
        text: `Meeting date: ${meeting.date}
Requested title: ${existingSummary.title || 'Hive Meeting'}
Known Hive members: ${memberNames || 'No member list available'}

Turn these meeting notes into app-ready structured data. Use only information supported by the notes. Do not invent dates, assignees, or commitments. Prefer exact member names when assigning work.

Return strict JSON only:
{
  "title": "short meeting title",
  "summary": "2-4 sentence useful summary",
  "decisions": ["decision"],
  "details": ["notable detail"],
  "action_items": [{"description": "specific task", "assigned_to_name": "member name, The group, or null", "due_date": "YYYY-MM-DD or null"}],
  "events": [{"title": "event title", "event_date": "YYYY-MM-DD", "event_time": "HH:MM:SS or null", "event_type": "meeting or custom", "description": "optional", "location": "optional"}],
  "wishes_surfaced": [{"person_name": "member name", "description": "specific wish or need"}],
  "queen_bee_highlights": ["highlight"],
  "board_suggestions": [{"person_name": "member name or null", "title": "suggested board post title", "content": "draft board update/resource note", "category_hint": "Resources, Announcements, or member/project area"}]
}`,
      },
    ];

    if (sourceFile?.base64 && sourceFile?.mimeType === 'application/pdf') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: sourceFile.base64,
        },
      });
    } else {
      content.push({
        type: 'text',
        text: `Meeting notes:
${meeting.transcript_attributed || meeting.transcript_raw || ''}`,
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3500,
      messages: [{ role: 'user', content }],
    } as any);

    const textBlock = response.content.find((block: any) => block.type === 'text') as { text?: string } | undefined;
    const analysis = parseJsonText(textBlock?.text ?? '{}') as MeetingAnalysis;
    const title = analysis.title?.trim() || existingSummary.title || 'Hive Meeting';

    await supabaseAdmin
      .from('action_items')
      .delete()
      .eq('meeting_id', meeting.id);

    const actionItems = (analysis.action_items ?? [])
      .filter((item) => item.description?.trim())
      .map((item) => ({
        meeting_id: meeting.id,
        community_id: communityId,
        description: item.description.trim(),
        assigned_to: matchMemberByName(item.assigned_to_name, members ?? []),
        due_date: isIsoDate(item.due_date) ? item.due_date : null,
      }));

    if (actionItems.length > 0) {
      const { error } = await supabaseAdmin.from('action_items').insert(actionItems);
      if (error) console.error('Failed to insert action items from notes:', error);
    }

    const createdEvents = [];
    for (const event of analysis.events ?? []) {
      if (!event.title?.trim() || !isIsoDate(event.event_date)) continue;

      const { data: existing } = await supabaseAdmin
        .from('events')
        .select('id')
        .eq('community_id', communityId)
        .eq('event_date', event.event_date)
        .eq('title', event.title.trim())
        .maybeSingle();

      if (existing) continue;

      const { data: created, error } = await supabaseAdmin
        .from('events')
        .insert({
          community_id: communityId,
          title: event.title.trim(),
          description: event.description?.trim() || null,
          event_date: event.event_date,
          event_time: event.event_time || null,
          event_type: event.event_type === 'meeting' ? 'meeting' : 'custom',
          location: event.location?.trim() || null,
          created_by: userId,
          status: 'scheduled',
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create event from notes:', error);
      } else if (created) {
        createdEvents.push(created);
      }
    }

    const createdBoardPosts = [];
    for (const suggestion of analysis.board_suggestions ?? []) {
      if (!suggestion.title?.trim() || !suggestion.content?.trim()) continue;

      const categoryId = await findBoardCategory(supabaseAdmin, communityId, suggestion, members ?? []);
      if (!categoryId) continue;

      const { data: existingPost } = await supabaseAdmin
        .from('board_posts')
        .select('id')
        .eq('community_id', communityId)
        .eq('category_id', categoryId)
        .eq('title', suggestion.title.trim())
        .maybeSingle();

      if (existingPost) continue;

      const { data: createdPost, error } = await supabaseAdmin
        .from('board_posts')
        .insert({
          community_id: communityId,
          category_id: categoryId,
          author_id: userId,
          title: suggestion.title.trim(),
          content: suggestion.content.trim(),
          attachments: null,
          is_pinned: false,
          is_locked: false,
        })
        .select('id, title, category_id')
        .single();

      if (error) {
        console.error('Failed to create board post from notes:', error);
      } else if (createdPost) {
        createdBoardPosts.push(createdPost);
      }
    }

    const summaryPayload = {
      ...existingSummary,
      imported_file: sourceFile?.base64
        ? { fileName: sourceFile.fileName, mimeType: sourceFile.mimeType }
        : sourceFile ?? null,
      source: existingSummary.source || 'meeting_notes',
      import_status: 'applied',
      applied_at: new Date().toISOString(),
      title,
      summary: analysis.summary ?? '',
      decisions: analysis.decisions ?? [],
      details: analysis.details ?? [],
      wishes_surfaced: analysis.wishes_surfaced ?? [],
      queen_bee_highlights: analysis.queen_bee_highlights ?? [],
      board_suggestions: analysis.board_suggestions ?? [],
      board_posts_created: createdBoardPosts,
      action_items_created: actionItems.length,
      events_created: createdEvents.length,
    };

    const { data: updatedMeeting, error: updateError } = await supabaseAdmin
      .from('meetings')
      .update({
        summary: JSON.stringify(summaryPayload),
        processing_status: 'complete',
      })
      .eq('id', meeting.id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update applied meeting notes:', updateError);
      return errorResponse(updateError.message || 'Failed to update meeting notes', 500);
    }

    await supabaseAdmin
      .from('context_summaries')
      .delete()
      .eq('community_id', communityId)
      .eq('summary_type', 'meetings');

    return jsonResponse({
      success: true,
      meeting: updatedMeeting,
      action_items_created: actionItems.length,
      events_created: createdEvents.length,
      board_posts_created: createdBoardPosts.length,
    });
  } catch (error) {
    console.error('Apply meeting notes error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to apply meeting notes', 500);
  }
});

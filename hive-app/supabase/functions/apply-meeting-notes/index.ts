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
  hd_boards?: Array<{
    person_name: string;
    goal_title: string;
    description?: string | null;
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

function getImportedFiles(summary: Record<string, any>) {
  const files = Array.isArray(summary.imported_files) ? summary.imported_files : [];
  if (files.length > 0) return files;
  return summary.imported_file ? [summary.imported_file] : [];
}

function stripFileData(file: Record<string, any>) {
  return {
    fileName: file.fileName,
    mimeType: file.mimeType,
  };
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

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || 'Someone';
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

async function getNextBoardDisplayOrder(supabaseAdmin: any, communityId: string) {
  const { data } = await supabaseAdmin
    .from('board_categories')
    .select('display_order')
    .eq('community_id', communityId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.display_order ?? 0) + 1;
}

async function ensureBoardMemberTag(
  supabaseAdmin: any,
  communityId: string,
  categoryId: string,
  taggedUserId: string,
  taggedBy: string
) {
  const { data: existing } = await supabaseAdmin
    .from('board_category_member_tags')
    .select('id')
    .eq('community_id', communityId)
    .eq('category_id', categoryId)
    .eq('tagged_user_id', taggedUserId)
    .maybeSingle();

  if (existing?.id) return;

  const { error } = await supabaseAdmin.from('board_category_member_tags').insert({
    community_id: communityId,
    category_id: categoryId,
    tagged_user_id: taggedUserId,
    tagged_by: taggedBy,
  });
  if (error) console.error('Failed to tag HD board owner:', error);
}

async function findOrCreateHdBoard(
  supabaseAdmin: any,
  communityId: string,
  board: { person_name?: string | null; goal_title?: string | null; description?: string | null },
  members: Member[],
  userId: string
) {
  const ownerId = matchMemberByName(board.person_name, members);
  const goalTitle = board.goal_title?.trim();
  if (!ownerId || !goalTitle) return null;

  const owner = members.find((member) => member.id === ownerId);
  const normalizedGoal = normalizeText(goalTitle);

  const { data: existingBoards } = await supabaseAdmin
    .from('board_categories')
    .select('id, name, goal_title')
    .eq('community_id', communityId)
    .eq('topic_kind', 'hd_board')
    .eq('owner_user_id', ownerId);

  const existing = (existingBoards ?? []).find((category: any) => {
    const existingGoal = normalizeText(category.goal_title);
    const existingName = normalizeText(category.name);
    return (existingGoal.length > 0 && (existingGoal.includes(normalizedGoal) || normalizedGoal.includes(existingGoal)))
      || existingName.includes(normalizedGoal);
  });
  if (existing?.id) {
    await ensureBoardMemberTag(supabaseAdmin, communityId, existing.id, ownerId, userId);
    return existing.id;
  }

  const displayOrder = await getNextBoardDisplayOrder(supabaseAdmin, communityId);
  const name = `${firstName(owner?.name)}'s HD: ${goalTitle}`;
  const { data: created, error } = await supabaseAdmin
    .from('board_categories')
    .insert({
      community_id: communityId,
      name,
      description: board.description?.trim() || `${firstName(owner?.name)}'s HummDinger/High Definition wish: ${goalTitle}`,
      category_type: 'custom',
      icon: '💎',
      audience: 'members',
      display_order: displayOrder,
      is_system: false,
      requires_admin: false,
      requires_approval: false,
      created_by: userId,
      topic_kind: 'hd_board',
      owner_user_id: ownerId,
      goal_title: goalTitle,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create HD board:', error);
    return null;
  }

  if (created?.id) {
    await ensureBoardMemberTag(supabaseAdmin, communityId, created.id, ownerId, userId);
  }
  return created?.id ?? null;
}

async function findBoardCategory(
  supabaseAdmin: any,
  communityId: string,
  suggestion: { person_name?: string | null; category_hint?: string | null },
  members: Member[]
) {
  const targetMemberId = matchMemberByName(suggestion.person_name, members);
  const categoryHint = suggestion.category_hint?.trim();
  const normalizedHint = normalizeText(categoryHint);

  if (normalizedHint.includes('15min') || normalizedHint.includes('helper')) {
    const { data: helperCategory } = await supabaseAdmin
      .from('board_categories')
      .select('id')
      .eq('community_id', communityId)
      .or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%')
      .limit(1)
      .maybeSingle();

    if (helperCategory?.id) return helperCategory.id;
  }

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
        .select('id, name, is_system, topic_kind, goal_title')
        .in('id', categoryIds)
        .eq('community_id', communityId)
        .order('is_system', { ascending: true })
        .order('created_at', { ascending: true });

      if (categories?.length) {
        const hint = normalizeText(suggestion.category_hint);
        const matchingHdBoard = hint
          ? categories.find((category: any) => category.topic_kind === 'hd_board'
            && (normalizeText(category.goal_title).includes(hint) || normalizeText(category.name).includes(hint)))
          : null;
        if (matchingHdBoard?.id) return matchingHdBoard.id;

        const firstHdBoard = categories.find((category: any) => category.topic_kind === 'hd_board');
        if (firstHdBoard?.id) return firstHdBoard.id;

        if (categories[0]?.id) return categories[0].id;
      }
    }
  }

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
    .in('name', ['HIVE Approved', 'Resources'])
    .order('name', { ascending: true })
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
    const { data: boardTopics } = await supabaseAdmin
      .from('board_categories')
      .select('name, topic_kind, goal_title, owner:profiles!board_categories_owner_user_id_fkey(name)')
      .eq('community_id', communityId)
      .order('display_order', { ascending: true });
    const boardTopicList = (boardTopics ?? [])
      .map((topic: any) => {
        const kind = topic.topic_kind === 'hd_board'
          ? `HD board for ${topic.owner?.name || 'member'}${topic.goal_title ? ` (${topic.goal_title})` : ''}`
          : topic.topic_kind === 'helper_log' ? 'helper log' : 'discussion';
        return `- ${topic.name}: ${kind}`;
      })
      .join('\n');
    const sourceFiles = getImportedFiles(existingSummary);
    const content: any[] = [
      {
        type: 'text',
        text: `Meeting date: ${meeting.date}
Requested title: ${existingSummary.title || 'HIVE Meeting'}
Known HIVE members: ${memberNames || 'No member list available'}
Existing board topics:
${boardTopicList || '- None yet'}

Turn these meeting notes into app-ready structured data. Use only information supported by the notes. Do not invent dates, assignees, or commitments. Prefer exact member names when assigning work.

HD boards are durable project boards for a member's current HummDinger/High Definition wish. Create one hd_boards entry for each distinct member goal that should get its own board. Reuse existing HD boards when the same person is still working on the same goal. Use the "15min HIVE Helpers" board for quick acts of help people completed or offered. Use "HIVE Approved" for trusted recommendations, favorite providers, brands, places, and community-approved resources.

Return strict JSON only:
{
  "title": "short meeting title",
  "summary": "2-4 sentence useful summary",
  "decisions": ["decision"],
  "details": ["notable detail"],
  "action_items": [{"description": "specific task", "assigned_to_name": "member name, The group, or null", "due_date": "YYYY-MM-DD or null"}],
  "events": [{"title": "event title", "event_date": "YYYY-MM-DD", "event_time": "HH:MM:SS or null", "event_type": "meeting or custom", "description": "optional", "location": "optional"}],
  "wishes_surfaced": [{"person_name": "member name", "description": "specific wish or need"}],
  "hd_boards": [{"person_name": "member name", "goal_title": "short project/goal name", "description": "what help belongs on this board"}],
  "queen_bee_highlights": ["highlight"],
  "board_suggestions": [{"person_name": "member name or null", "title": "suggested board post title", "content": "draft board update/resource note", "category_hint": "existing board name, HD goal title, 15min HIVE Helpers, HIVE Approved, Announcements, or member/project area"}]
}`,
      },
    ];

    content.push({
      type: 'text',
      text: `Meeting notes:
${meeting.transcript_attributed || meeting.transcript_raw || ''}`,
    });

    for (const file of sourceFiles) {
      if (!file?.base64 || !file?.mimeType) continue;

      if (file.mimeType === 'application/pdf') {
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: file.base64,
          },
        });
        continue;
      }

      if (String(file.mimeType).startsWith('image/')) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mimeType,
            data: file.base64,
          },
        });
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3500,
      messages: [{ role: 'user', content }],
    } as any);

    const textBlock = response.content.find((block: any) => block.type === 'text') as { text?: string } | undefined;
    const analysis = parseJsonText(textBlock?.text ?? '{}') as MeetingAnalysis;
    const title = analysis.title?.trim() || existingSummary.title || 'HIVE Meeting';

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

    const createdHdBoards = [];
    for (const board of analysis.hd_boards ?? []) {
      const categoryId = await findOrCreateHdBoard(supabaseAdmin, communityId, board, members ?? [], userId);
      if (categoryId) {
        createdHdBoards.push({
          category_id: categoryId,
          person_name: board.person_name,
          goal_title: board.goal_title,
        });
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
      imported_file: sourceFiles[0]?.base64 ? stripFileData(sourceFiles[0]) : sourceFiles[0] ?? null,
      imported_files: sourceFiles.map((file: Record<string, any>) => file?.base64 ? stripFileData(file) : file),
      source: existingSummary.source || 'meeting_notes',
      import_status: 'applied',
      applied_at: new Date().toISOString(),
      title,
      summary: analysis.summary ?? '',
      decisions: analysis.decisions ?? [],
      details: analysis.details ?? [],
      wishes_surfaced: analysis.wishes_surfaced ?? [],
      hd_boards: analysis.hd_boards ?? [],
      hd_boards_created: createdHdBoards,
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
      .in('summary_type', ['meetings', 'board_activity']);

    return jsonResponse({
      success: true,
      meeting: updatedMeeting,
      action_items_created: actionItems.length,
      events_created: createdEvents.length,
      hd_boards_created: createdHdBoards.length,
      board_posts_created: createdBoardPosts.length,
    });
  } catch (error) {
    console.error('Apply meeting notes error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to apply meeting notes', 500);
  }
});

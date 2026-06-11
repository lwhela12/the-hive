import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

type ApplyMeetingNotesMode = 'preview' | 'apply';

interface MeetingNotesSelection {
  action_item_indices?: number[];
  event_indices?: number[];
  hd_board_indices?: number[];
  board_suggestion_indices?: number[];
}

interface ApplyMeetingNotesRequest {
  meetingId: string;
  mode?: ApplyMeetingNotesMode;
  selection?: MeetingNotesSelection;
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

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function normalizeMeetingAnalysis(value: Record<string, any>): MeetingAnalysis {
  const actionItems = Array.isArray(value.action_items) ? value.action_items : [];
  const events = Array.isArray(value.events) ? value.events : [];
  const wishesSurfaced = Array.isArray(value.wishes_surfaced) ? value.wishes_surfaced : [];
  const hdBoards = Array.isArray(value.hd_boards) ? value.hd_boards : [];
  const boardSuggestions = Array.isArray(value.board_suggestions) ? value.board_suggestions : [];

  return {
    title: typeof value.title === 'string' ? value.title.trim() : undefined,
    summary: typeof value.summary === 'string' ? value.summary.trim() : '',
    decisions: cleanStringArray(value.decisions),
    details: cleanStringArray(value.details),
    action_items: actionItems
      .filter((item: Record<string, any>) => typeof item?.description === 'string' && item.description.trim().length > 0)
      .map((item: Record<string, any>) => ({
        description: item.description.trim(),
        assigned_to_name: typeof item.assigned_to_name === 'string' && item.assigned_to_name.trim()
          ? item.assigned_to_name.trim()
          : null,
        due_date: isIsoDate(item.due_date) ? item.due_date : null,
      })),
    events: events
      .filter((event: Record<string, any>) => typeof event?.title === 'string' && event.title.trim().length > 0 && isIsoDate(event.event_date))
      .map((event: Record<string, any>) => ({
        title: event.title.trim(),
        event_date: event.event_date,
        event_time: typeof event.event_time === 'string' && event.event_time.trim() ? event.event_time.trim() : null,
        event_type: event.event_type === 'meeting' ? 'meeting' : 'custom',
        description: typeof event.description === 'string' && event.description.trim() ? event.description.trim() : null,
        location: typeof event.location === 'string' && event.location.trim() ? event.location.trim() : null,
      })),
    wishes_surfaced: wishesSurfaced
      .filter((wish: Record<string, any>) => typeof wish?.person_name === 'string' && typeof wish?.description === 'string')
      .map((wish: Record<string, any>) => ({
        person_name: wish.person_name.trim(),
        description: wish.description.trim(),
      }))
      .filter((wish) => wish.person_name && wish.description),
    hd_boards: hdBoards
      .filter((board: Record<string, any>) => typeof board?.person_name === 'string' && typeof board?.goal_title === 'string')
      .map((board: Record<string, any>) => ({
        person_name: board.person_name.trim(),
        goal_title: board.goal_title.trim(),
        description: typeof board.description === 'string' && board.description.trim() ? board.description.trim() : null,
      }))
      .filter((board) => board.person_name && board.goal_title),
    board_suggestions: boardSuggestions
      .filter((suggestion: Record<string, any>) => typeof suggestion?.title === 'string' && typeof suggestion?.content === 'string')
      .map((suggestion: Record<string, any>) => ({
        person_name: typeof suggestion.person_name === 'string' && suggestion.person_name.trim()
          ? suggestion.person_name.trim()
          : null,
        title: suggestion.title.trim(),
        content: suggestion.content.trim(),
        category_hint: typeof suggestion.category_hint === 'string' && suggestion.category_hint.trim()
          ? suggestion.category_hint.trim()
          : null,
      }))
      .filter((suggestion) => suggestion.title && suggestion.content),
  };
}

function getStoredAnalysis(summary: Record<string, any>): MeetingAnalysis {
  return normalizeMeetingAnalysis({
    title: summary.title,
    summary: summary.summary,
    decisions: summary.decisions,
    details: summary.details,
    action_items: summary.action_items,
    events: summary.events,
    wishes_surfaced: summary.wishes_surfaced,
    hd_boards: summary.hd_boards,
    board_suggestions: summary.board_suggestions,
  });
}

function hasStoredProposal(summary: Record<string, any>) {
  return Array.isArray(summary.action_items)
    || Array.isArray(summary.events)
    || Array.isArray(summary.hd_boards)
    || Array.isArray(summary.board_suggestions);
}

function selectByIndex<T>(items: T[], selectedIndices?: number[]) {
  if (!selectedIndices) return items;

  const selected = new Set(
    selectedIndices.filter((index) => Number.isInteger(index) && index >= 0)
  );
  return items.filter((_, index) => selected.has(index));
}

function selectAnalysis(analysis: MeetingAnalysis, selection?: MeetingNotesSelection): MeetingAnalysis {
  return {
    ...analysis,
    action_items: selectByIndex(analysis.action_items ?? [], selection?.action_item_indices),
    events: selectByIndex(analysis.events ?? [], selection?.event_indices),
    hd_boards: selectByIndex(analysis.hd_boards ?? [], selection?.hd_board_indices),
    board_suggestions: selectByIndex(analysis.board_suggestions ?? [], selection?.board_suggestion_indices),
  };
}

function countAnalysisItems(analysis: MeetingAnalysis) {
  const actionItems = analysis.action_items?.length ?? 0;
  const events = analysis.events?.length ?? 0;
  const hdBoards = analysis.hd_boards?.length ?? 0;
  const boardPosts = analysis.board_suggestions?.length ?? 0;

  return {
    action_items: actionItems,
    events,
    hd_boards: hdBoards,
    board_posts: boardPosts,
    total: actionItems + events + hdBoards + boardPosts,
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

async function analyzeMeetingNotes(
  supabaseAdmin: any,
  meeting: Record<string, any>,
  existingSummary: Record<string, any>,
  members: Member[],
  sourceFiles: Record<string, any>[]
) {
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  const memberNames = members.map((member) => member.name).join(', ');
  const { data: boardTopics } = await supabaseAdmin
    .from('board_categories')
    .select('name, topic_kind, goal_title, owner:profiles!board_categories_owner_user_id_fkey(name)')
    .eq('community_id', meeting.community_id)
    .order('display_order', { ascending: true });
  const boardTopicList = (boardTopics ?? [])
    .map((topic: any) => {
      const kind = topic.topic_kind === 'hd_board'
        ? `HD board for ${topic.owner?.name || 'member'}${topic.goal_title ? ` (${topic.goal_title})` : ''}`
        : topic.topic_kind === 'helper_log' ? 'helper log' : 'discussion';
      return `- ${topic.name}: ${kind}`;
    })
    .join('\n');
  const content: any[] = [
    {
      type: 'text',
      text: `Meeting date: ${meeting.date}
Requested title: ${existingSummary.title || 'HIVE Meeting'}
Known HIVE members: ${memberNames || 'No member list available'}
Existing board topics:
${boardTopicList || '- None yet'}

Turn these meeting notes into app-ready structured data. Use only information supported by the notes. Do not invent dates, assignees, or commitments. Prefer exact member names when assigning work.

HD boards are durable project boards for a member's current HummDinger/High Definition wish. Create one hd_boards entry for each distinct member goal that should get its own board. Reuse existing HD boards when the same person is still working on the same goal. For HummDinger or High Definition session resources, asks, offers, and blockers tied to a specific member, create board_suggestions with that member as person_name and use their exact HD board name as category_hint when it exists. Use shared boards only for explicitly group-wide topics: "15min HIVE Helpers" for quick acts of help people completed or offered, "HIVE Approved" for trusted recommendations, favorite providers, brands, places, and community-approved resources, and "HIVE Hangs" for group social planning.

Wishes surfaced are meeting-summary candidates only. Capture the wish or need in wishes_surfaced, but do not turn it into a formal wish record here. Use board_suggestions only when the notes support a concrete discussion thread, resource request, or follow-up post for the reviewer to approve.

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
  return normalizeMeetingAnalysis(parseJsonText(textBlock?.text ?? '{}'));
}

async function writeApprovedMeetingNotes(
  supabaseAdmin: any,
  params: {
    meetingId: string;
    communityId: string;
    userId: string;
    members: Member[];
    analysis: MeetingAnalysis;
  }
) {
  const { meetingId, communityId, userId, members, analysis } = params;

  await supabaseAdmin
    .from('action_items')
    .delete()
    .eq('meeting_id', meetingId);

  const actionItems = (analysis.action_items ?? [])
    .filter((item) => item.description?.trim())
    .map((item) => ({
      meeting_id: meetingId,
      community_id: communityId,
      description: item.description.trim(),
      assigned_to: matchMemberByName(item.assigned_to_name, members),
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
    const categoryId = await findOrCreateHdBoard(supabaseAdmin, communityId, board, members, userId);
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

    const categoryId = await findBoardCategory(supabaseAdmin, communityId, suggestion, members);
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

  return {
    actionItems,
    createdEvents,
    createdHdBoards,
    createdBoardPosts,
  };
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
    const mode: ApplyMeetingNotesMode = body.mode === 'preview' ? 'preview' : 'apply';

    const { data: memberRows } = await supabaseAdmin
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', communityId);

    const memberIds = memberRows?.map((row: { user_id: string }) => row.user_id) ?? [];
    const { data: memberData } = memberIds.length
      ? await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .in('id', memberIds)
      : { data: [] as Member[] };
    const members = (memberData ?? []) as Member[];
    const sourceFiles = getImportedFiles(existingSummary);

    const shouldUseStoredProposal = mode === 'apply'
      && existingSummary.import_status === 'preview'
      && hasStoredProposal(existingSummary);
    const analysis = shouldUseStoredProposal
      ? getStoredAnalysis(existingSummary)
      : await analyzeMeetingNotes(supabaseAdmin, meeting, existingSummary, members, sourceFiles);
    const title = analysis.title?.trim() || existingSummary.title || 'HIVE Meeting';
    const summaryBase = { ...existingSummary };
    delete summaryBase.queen_bee_highlights;
    const commonSummaryPayload = {
      ...summaryBase,
      imported_file: sourceFiles[0]?.base64 ? stripFileData(sourceFiles[0]) : sourceFiles[0] ?? null,
      imported_files: sourceFiles.map((file: Record<string, any>) => file?.base64 ? stripFileData(file) : file),
      source: existingSummary.source || 'meeting_notes',
      title,
      summary: analysis.summary ?? '',
      decisions: analysis.decisions ?? [],
      details: analysis.details ?? [],
      wishes_surfaced: analysis.wishes_surfaced ?? [],
      action_items: analysis.action_items ?? [],
      events: analysis.events ?? [],
      hd_boards: analysis.hd_boards ?? [],
      board_suggestions: analysis.board_suggestions ?? [],
      preview_counts: countAnalysisItems(analysis),
    };

    if (mode === 'preview') {
      const summaryPayload = {
        ...commonSummaryPayload,
        import_status: 'preview',
        preview_generated_at: new Date().toISOString(),
        board_posts_created: [],
        hd_boards_created: [],
        action_items_created: 0,
        events_created: 0,
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
        console.error('Failed to save meeting notes preview:', updateError);
        return errorResponse(updateError.message || 'Failed to save meeting notes preview', 500);
      }

      await supabaseAdmin
        .from('context_summaries')
        .delete()
        .eq('community_id', communityId)
        .in('summary_type', ['meetings', 'board_activity']);

      return jsonResponse({
        success: true,
        mode: 'preview',
        meeting: updatedMeeting,
        preview_counts: countAnalysisItems(analysis),
      });
    }

    const approvedAnalysis = selectAnalysis(analysis, body.selection);
    const approvedCounts = countAnalysisItems(approvedAnalysis);
    if (body.selection && approvedCounts.total === 0) {
      return errorResponse('Select at least one proposed item to apply.', 400);
    }

    const applied = await writeApprovedMeetingNotes(supabaseAdmin, {
      meetingId: meeting.id,
      communityId,
      userId,
      members,
      analysis: approvedAnalysis,
    });

    const summaryPayload = {
      ...commonSummaryPayload,
      import_status: 'applied',
      applied_at: new Date().toISOString(),
      approved_selection: body.selection ?? null,
      approved_counts: approvedCounts,
      action_items: approvedAnalysis.action_items ?? [],
      events: approvedAnalysis.events ?? [],
      hd_boards: approvedAnalysis.hd_boards ?? [],
      board_suggestions: approvedAnalysis.board_suggestions ?? [],
      hd_boards_created: applied.createdHdBoards,
      board_posts_created: applied.createdBoardPosts,
      action_items_created: applied.actionItems.length,
      events_created: applied.createdEvents.length,
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
      mode: 'apply',
      meeting: updatedMeeting,
      action_items_created: applied.actionItems.length,
      events_created: applied.createdEvents.length,
      hd_boards_created: applied.createdHdBoards.length,
      board_posts_created: applied.createdBoardPosts.length,
    });
  } catch (error) {
    console.error('Apply meeting notes error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to apply meeting notes', 500);
  }
});

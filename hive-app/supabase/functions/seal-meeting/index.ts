import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

// "The meeting notes write themselves": compose everything that happened in
// the app on meeting day (events penciled in, to-dos fanned out, wish notes,
// wishes granted, threads opened) into a real meeting record on the Meetings
// tab — no transcription, no Apply Notes required. Called from the Wrap-Up
// slide's Seal button, or with the service key (daily cron auto-seal).

interface SealMeetingRequest {
  communityId: string;
  /** Local meeting date (YYYY-MM-DD). Defaults to today in Pacific time. */
  date?: string;
}

function pacificToday() {
  // The HIVE lives in Pacific time; good enough for a default.
  return new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
}

function monthName(date: string) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
}

function firstName(name?: string | null) {
  return (name ?? '').trim().split(/\s+/)[0] || 'someone';
}

// Same routing-token stripping as lib/actionItemDisplay.ts on the client.
function cleanJotText(description: string) {
  let text = description.trim();
  const mentionMatch = text.match(/^((?:@[\w.-]+[,\s]+)+)/);
  if (mentionMatch) text = text.slice(mentionMatch[0].length).trim();
  const reMatch = text.match(/\s*\(re:\s*([^)]+)\)$/i);
  if (reMatch) text = text.slice(0, text.length - reMatch[0].length).trim();
  return text || description.trim();
}


// Claude writes the recap. Everything it receives is a fact the app already
// recorded and attributed, so there is nothing for it to infer about who said
// what — it is arranging known facts into prose, not interpreting audio.
// If the call fails for any reason, the caller's counts line is used instead:
// a plain summary is a far better outcome than a failed seal.
async function writeRecap(input: {
  month: string;
  facts: {
    events: { title: string; event_date: string }[];
    todoGroups: Map<string, { names: string[]; about: string | null }>;
    notes: { content: string; wish?: { user?: { name?: string } | null } | null }[];
    granted: { title: string | null; description: string; user?: { name?: string } | null }[];
    threads: string[];
    checkIns: { name: string; answers: Record<string, unknown> }[];
  };
  fallback: string;
}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return input.fallback;

  const { events, todoGroups, notes, granted, threads, checkIns } = input.facts;

  const answerText = (answers: Record<string, unknown>, key: string) => {
    const value = answers[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  const lines: string[] = [];
  if (checkIns.length > 0) {
    lines.push('WHERE EVERYONE IS (from their check-ins):');
    checkIns.forEach((entry) => {
      const progress = answerText(entry.answers, 'q_pop_progress');
      const obstacles = answerText(entry.answers, 'q_pop_obstacles');
      const priorities = answerText(entry.answers, 'q_pop_priorities');
      if (!progress && !obstacles && !priorities) return;
      lines.push(`- ${entry.name}:`);
      if (progress) lines.push(`    progress: ${progress}`);
      if (obstacles) lines.push(`    stuck on / needs: ${obstacles}`);
      if (priorities) lines.push(`    focused on next: ${priorities}`);
    });
  }
  if (granted.length > 0) {
    lines.push('WISHES GRANTED:');
    granted.forEach((wish) => {
      const owner = wish.user?.name ? firstName(wish.user.name) : 'someone';
      lines.push(`- ${owner}: ${(wish.title ?? wish.description).slice(0, 120)}`);
    });
  }
  if (todoGroups.size > 0) {
    lines.push('WHO TOOK ON WHAT:');
    todoGroups.forEach((group, text) => {
      const who = group.names.length > 3 ? `${group.names.length} members` : group.names.join(', ');
      lines.push(`- ${text}${who ? ` — ${who}` : ''}${group.about ? ` (about ${group.about}'s HD)` : ''}`);
    });
  }
  if (notes.length > 0) {
    lines.push('NOTES TAKEN ON WISHES:');
    notes.forEach((note) => {
      const owner = note.wish?.user?.name ? firstName(note.wish.user.name) : 'someone';
      lines.push(`- on ${owner}'s wish: ${note.content.replace(/^📝 From the [A-Za-z]+ meeting:\s*/i, '').slice(0, 200)}`);
    });
  }
  if (events.length > 0) {
    lines.push('SCHEDULED:');
    events.forEach((event) => lines.push(`- ${event.title} (${event.event_date})`));
  }
  if (threads.length > 0) {
    lines.push(`NEW BOARD THREADS: ${threads.join(' · ')}`);
  }

  const system = [
    'You write the recap of a HIVE meeting for a member who could not make it.',
    'HIVE is a 12-person community that practises "high-definition wishing": people',
    'articulate what they actually need (an "HD"), and others grant those wishes.',
    '',
    'Write 2-4 short paragraphs of warm, plain prose. Lead with what actually',
    'happened and what changed for people — not with statistics. Name people by',
    'first name. Mention what someone is stuck on when it is the kind of thing a',
    'friend could help with, and say plainly who took on what.',
    '',
    'Rules:',
    '- Use ONLY the facts given. Never invent an attendee, a decision, or a quote.',
    '- If something is missing, leave it out rather than guessing.',
    '- No headings, no bullet lists, no markdown — just paragraphs.',
    '- Do not open with "In this meeting" or "The team discussed".',
  ].join('\n');

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system,
      messages: [{
        role: 'user',
        content: `Here is everything the app recorded for the ${input.month} HIVE meeting.\n\n${lines.join('\n')}`,
      }],
    });

    // A refusal returns HTTP 200 with empty or partial content — check before
    // reading, or an unlucky turn of phrase silently produces a blank recap.
    if ((response as { stop_reason?: string }).stop_reason === 'refusal') return input.fallback;

    const text = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text.trim())
      .join('\n\n')
      .trim();
    return text || input.fallback;
  } catch (error) {
    console.warn('Recap write failed; falling back to the counts line:', error);
    return input.fallback;
  }
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  try {
    const body = (await req.json()) as SealMeetingRequest;
    const communityId = body.communityId;
    if (!communityId) return errorResponse('Missing communityId', 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : pacificToday();

    // Auth: the daily cron calls with the service key; members seal from the deck.
    const authHeader = req.headers.get('Authorization') ?? '';
    let sealedBy: string | null = null;
    if (authHeader !== `Bearer ${serviceKey}`) {
      const auth = await verifySupabaseJwt(authHeader);
      if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
      const { data: membership } = await supabaseAdmin
        .from('community_memberships')
        .select('id')
        .eq('community_id', communityId)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (!membership) return errorResponse('Community membership required', 403);
      sealedBy = auth.userId;
    }

    // The meeting-day window in Pacific time (07:00Z ≈ PT midnight).
    const startIso = `${date}T07:00:00Z`;
    const endIso = new Date(Date.parse(startIso) + 24 * 3600_000).toISOString();

    const [eventsRes, todosRes, notesRes, grantedRes, threadsRes] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('title, event_date')
        .eq('community_id', communityId)
        .gte('created_at', startIso).lt('created_at', endIso),
      supabaseAdmin
        .from('action_items')
        .select('description, assigned_to, assignee:profiles!assigned_to(name), about:profiles!related_user_id(name)')
        .eq('community_id', communityId)
        .gte('created_at', startIso).lt('created_at', endIso),
      supabaseAdmin
        .from('wish_comments')
        .select('content, wish:wishes!wish_id(title, description, user:profiles!user_id(name))')
        .eq('community_id', communityId)
        .like('content', '📝 From the%')
        .gte('created_at', startIso).lt('created_at', endIso),
      supabaseAdmin
        .from('wishes')
        .select('title, description, user:profiles!user_id(name), granters:wish_granters(granter:profiles!granter_id(name))')
        .eq('community_id', communityId)
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', startIso).lt('fulfilled_at', endIso),
      supabaseAdmin
        .from('board_posts')
        .select('title')
        .eq('community_id', communityId)
        .gte('created_at', startIso).lt('created_at', endIso),
    ]);

    const events = (eventsRes.data ?? []) as { title: string; event_date: string }[];
    const todos = (todosRes.data ?? []) as {
      description: string;
      assigned_to: string | null;
      assignee?: { name?: string } | null;
      about?: { name?: string } | null;
    }[];
    const notes = (notesRes.data ?? []) as {
      content: string;
      wish?: { title?: string | null; description?: string; user?: { name?: string } | null } | null;
    }[];
    const granted = (grantedRes.data ?? []) as {
      title: string | null;
      description: string;
      user?: { name?: string } | null;
      granters?: { granter?: { name?: string } | null }[];
    }[];
    const threads = ((threadsRes.data ?? []) as { title: string | null }[])
      .map((row) => row.title).filter(Boolean) as string[];

    // The check-ins are the other half of the meeting: what people said they're
    // working on, stuck on, and focused on. They're what makes a recap readable
    // to someone who wasn't there, rather than a list of clicks.
    const { data: checkInRows } = await supabaseAdmin
      .from('survey_responses')
      .select('answers, submitted_at, user:profiles!user_id(name), survey:surveys!survey_id(title)')
      .gte('submitted_at', new Date(Date.parse(startIso) - 45 * 24 * 3600_000).toISOString())
      .order('submitted_at', { ascending: false })
      .limit(40);
    const checkIns = ((checkInRows ?? []) as any[])
      .filter((row) => /check-in/i.test(row.survey?.title ?? ''))
      .map((row) => ({
        name: row.user?.name ? firstName(row.user.name) : 'Someone',
        answers: (row.answers ?? {}) as Record<string, unknown>,
      }));

    // Fan-outs create one row per member for the same jot — group by clean text.
    const todoGroups = new Map<string, { names: string[]; about: string | null }>();
    todos.forEach((todo) => {
      const text = cleanJotText(todo.description);
      const group = todoGroups.get(text) ?? { names: [], about: todo.about?.name ? firstName(todo.about.name) : null };
      const name = todo.assignee?.name ? firstName(todo.assignee.name) : null;
      if (name && !group.names.includes(name)) group.names.push(name);
      todoGroups.set(text, group);
    });

    const details: string[] = [];
    events.forEach((event) => details.push(`🗓️ Scheduled: ${event.title} (${event.event_date})`));
    todoGroups.forEach((group, text) => {
      const who = group.names.length === 0
        ? ''
        : group.names.length > 3
          ? ` — for ${group.names.length} members`
          : ` — for ${group.names.join(', ')}`;
      const about = group.about ? ` (re: ${group.about}'s HD)` : '';
      details.push(`📝 ${text}${who}${about}`);
    });
    notes.forEach((note) => {
      const owner = note.wish?.user?.name ? firstName(note.wish.user.name) : null;
      const text = note.content.replace(/^📝 From the [A-Za-z]+ meeting:\s*/i, '').replace(/^📝 From the meeting:\s*/i, '');
      details.push(`💛 Note on ${owner ? `${owner}'s` : 'a'} wish: ${text}`);
    });
    granted.forEach((wish) => {
      const granters = (wish.granters ?? [])
        .map((row) => (row.granter?.name ? firstName(row.granter.name) : null))
        .filter(Boolean);
      const label = (wish.title ?? wish.description).slice(0, 80);
      details.push(`🌟 Granted: ${label}${granters.length ? ` (thanks ${granters.join(', ')})` : ''}`);
    });
    threads.forEach((title) => details.push(`📌 New thread: ${title}`));

    if (details.length === 0) {
      return jsonResponse({ success: true, sealed: false, reason: 'Nothing happened in the app on that date.' });
    }

    const month = monthName(date);
    const todoPeople = new Set(todos.map((todo) => todo.assigned_to).filter(Boolean)).size;
    const summaryText =
      `Live notes from the ${month} meeting — written in the app as the night unfolded. ` +
      [
        events.length ? `${events.length} event${events.length === 1 ? '' : 's'} penciled in` : null,
        todoGroups.size ? `${todoGroups.size} to-do${todoGroups.size === 1 ? '' : 's'} handed out across ${todoPeople} list${todoPeople === 1 ? '' : 's'}` : null,
        notes.length ? `${notes.length} wish note${notes.length === 1 ? '' : 's'}` : null,
        granted.length ? `${granted.length} wish${granted.length === 1 ? '' : 'es'} granted` : null,
        threads.length ? `${threads.length} thread${threads.length === 1 ? '' : 's'} opened` : null,
      ].filter(Boolean).join(' · ') + '.';

    // One meeting record per date: merge into an existing row (imported
    // transcript stays as the detail layer) or create a fresh one.
    const { data: existingRows } = await supabaseAdmin
      .from('meetings')
      .select('id, summary, transcript_raw')
      .eq('community_id', communityId)
      .eq('date', date)
      .order('created_at', { ascending: true });
    const existing = (existingRows ?? []).find((row) => row.transcript_raw) ?? (existingRows ?? [])[0] ?? null;

    let previous: Record<string, unknown> = {};
    if (existing?.summary) {
      try { previous = JSON.parse(existing.summary); } catch { previous = {}; }
    }

    // The recap itself. The counts line above is the fallback and the floor —
    // accurate but lifeless ("8 to-dos handed out across 10 lists"). Someone who
    // missed the meeting deserves prose, so Claude writes it from the structured
    // facts. This is NOT transcription: there's no audio and no speaker
    // attribution to get wrong — every fact below is already labelled with whose
    // it is, which is exactly the problem that killed the transcript approach.
    const narrative = await writeRecap({
      month,
      facts: { events, todoGroups, notes, granted, threads, checkIns },
      fallback: summaryText,
    });

    const summaryPayload = {
      ...previous,
      source: 'live_meeting',
      title: `${month} HIVE Meeting`,
      // Live notes supersede the apply nag; an already-applied import keeps its badge.
      import_status: previous.import_status === 'applied' ? 'applied' : 'live',
      summary: narrative,
      decisions: (previous.decisions as string[] | undefined) ?? [],
      details,
      wishes_surfaced: (previous.wishes_surfaced as unknown[] | undefined) ?? [],
      board_posts_created: threads,
      action_items_created: todos.length,
      events_created: events.length,
      live_sealed_at: new Date().toISOString(),
      recap_written_by: narrative === summaryText ? 'counts' : 'clive',
    };

    let meetingId = existing?.id ?? null;
    if (existing) {
      const { error } = await supabaseAdmin
        .from('meetings')
        .update({ summary: JSON.stringify(summaryPayload), processing_status: 'complete' })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('meetings')
        .insert({
          date,
          transcript_raw: '',
          transcript_attributed: '',
          summary: JSON.stringify(summaryPayload),
          recorded_by: sealedBy,
          processing_status: 'complete',
          community_id: communityId,
        })
        .select('id')
        .single();
      if (error) throw error;
      meetingId = inserted.id;
    }

    return jsonResponse({
      success: true,
      sealed: true,
      meetingId,
      counts: {
        events: events.length,
        todos: todoGroups.size,
        wishNotes: notes.length,
        granted: granted.length,
        threads: threads.length,
      },
    });
  } catch (error) {
    console.error('Seal meeting error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to seal the meeting', 500);
  }
});

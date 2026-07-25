import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
    const [notesRow, ledgerRows, memberRows, wishRows] = await Promise.all([
      supabaseAdmin.from('communities').select('meeting_helper_notes').eq('id', communityId).maybeSingle(),
      supabaseAdmin.from('honey_pot_transactions').select('amount').eq('community_id', communityId),
      supabaseAdmin.from('community_memberships').select('user:profiles!user_id(id, name)').eq('community_id', communityId),
      supabaseAdmin.from('wishes')
        .select('title, description, user_id, is_spotlight, created_at')
        .eq('community_id', communityId).eq('status', 'public')
        .order('created_at', { ascending: false }),
    ]);
    const deckNotes = ((notesRow.data as any)?.meeting_helper_notes ?? {}) as Record<string, string>;
    const potBalance = ((ledgerRows.data ?? []) as { amount: number | string }[])
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const memberNames = new Map<string, string>();
    ((memberRows.data ?? []) as any[]).forEach((row) => {
      if (row.user?.id) memberNames.set(row.user.id, firstName(row.user.name ?? 'Someone'));
    });
    // Same rule the app uses everywhere: your starred wish, else your newest.
    const hdByUser = new Map<string, string>();
    ((wishRows.data ?? []) as any[]).forEach((wish) => {
      const label = (wish.title || wish.description || '').trim();
      if (!label) return;
      if (wish.is_spotlight) hdByUser.set(wish.user_id, label);
      else if (!hdByUser.has(wish.user_id)) hdByUser.set(wish.user_id, label);
    });

    const { data: checkInRows } = await supabaseAdmin
      .from('survey_responses')
      .select('answers, submitted_at, user_id, user:profiles!user_id(name), survey:surveys!survey_id(title)')
      .gte('submitted_at', new Date(Date.parse(startIso) - 45 * 24 * 3600_000).toISOString())
      .order('submitted_at', { ascending: false })
      .limit(40);
    const checkIns = ((checkInRows ?? []) as any[])
      .filter((row) => /check-in/i.test(row.survey?.title ?? ''))
      .map((row) => ({
        userId: row.user_id as string,
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

    // THE SUMMARY IS THE DECK, IN OUTLINE (Nat 2026-07-25: "we don't need to
    // double up our work"). Same running order as the meeting helper — News,
    // Treasurer, Meet-Ups, HummDingers, Wrap-Up — so catching up reads like
    // walking the slides, and nothing has to be written twice or recorded.
    const answerOf = (answers: Record<string, unknown>, key: string) => {
      const value = answers[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const bulletsFrom = (text?: string) => (text ?? '')
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*]+/, '').trim())
      .filter(Boolean);

    const sections: { title: string; lines: string[] }[] = [];

    // News and App updates are separate headers — they're different kinds of
    // announcement and were reading as one long list (Nat 2026-07-25). New
    // board threads join the news: they're things to tell people about.
    const newsLines = [
      ...bulletsFrom(deckNotes.news),
      ...threads.map((title) => `New board thread: ${title}`),
    ];
    if (newsLines.length > 0) sections.push({ title: 'News from Nat', lines: newsLines });

    const appLines = bulletsFrom(deckNotes.appnews);
    if (appLines.length > 0) sections.push({ title: 'App updates', lines: appLines });

    sections.push({
      title: 'Treasurer',
      lines: [`Honey Pot balance: $${potBalance.toFixed(2)}`],
    });

    const meetupLines = [
      ...bulletsFrom(deckNotes.meetups),
      ...events.map((event) => `Scheduled: ${event.title} (${event.event_date})`),
    ];
    if (meetupLines.length > 0) sections.push({ title: 'HIVE Hangs & Help', lines: meetupLines });

    // One block per person: their HD, their POP, and what they walked away with.
    const hdLines: string[] = [];
    const seen = new Set<string>();
    checkIns.forEach((entry) => {
      if (seen.has(entry.userId)) return;
      seen.add(entry.userId);
      const hd = hdByUser.get(entry.userId);
      const progress = answerOf(entry.answers, 'q_pop_progress');
      const obstacles = answerOf(entry.answers, 'q_pop_obstacles');
      const priorities = answerOf(entry.answers, 'q_pop_priorities');
      const took: string[] = [];
      todoGroups.forEach((group, text) => {
        if (group.names.includes(entry.name)) took.push(text);
      });
      if (!hd && !progress && !obstacles && !priorities && took.length === 0) return;

      hdLines.push(`${entry.name}${hd ? ` — ${hd}` : ''}`);
      if (progress) hdLines.push(`    Progress: ${progress}`);
      if (obstacles) hdLines.push(`    Obstacles / how HIVE can help: ${obstacles}`);
      if (priorities) hdLines.push(`    Priorities: ${priorities}`);
      if (took.length > 0) hdLines.push(`    Took on: ${took.join(' · ')}`);
    });
    if (hdLines.length > 0) sections.push({ title: "HummDingers — everyone's POP", lines: hdLines });

    // Granted wishes are the whole point of the HIVE, so they keep a section of
    // their own rather than being buried in a wrap-up. The rest of the old
    // wrap-up (raw detail dump, board-post list) is gone — the sections above
    // already say all of it.
    const grantedLines = granted.map((wish) => {
      const owner = wish.user?.name ? firstName(wish.user.name) : 'Someone';
      const granters = (wish.granters ?? [])
        .map((row) => (row.granter?.name ? firstName(row.granter.name) : null))
        .filter(Boolean);
      return `${owner}: ${(wish.title ?? wish.description).slice(0, 90)}${granters.length ? ` — thanks ${granters.join(', ')}` : ''}`;
    });
    if (grantedLines.length > 0) sections.push({ title: 'Wishes granted 🌟', lines: grantedLines });

    const narrative = summaryText;

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
      sections,
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

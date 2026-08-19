import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { recordAssistantUsage } from '../_shared/metering.ts';

// "The meeting notes write themselves": compose everything that happened in
// the app on meeting day (events penciled in, to-dos fanned out, wish notes,
// wishes granted, threads opened) into a real meeting record on the Meetings
// tab — no transcription, no Apply Notes required. Called from the Wrap-Up
// slide's Seal button, or with the service key (daily cron auto-seal).

interface SealMeetingRequest {
  communityId: string;
  /** Local meeting date (YYYY-MM-DD). Defaults to today in Pacific time. */
  date?: string;
  /** Explicit Wrap-Up roll call. Never inferred from q_attendance. */
  confirmed_absentee_ids?: string[];
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



// Turn each person's check-in into one readable line. Everything handed over is
// already attributed — this is condensing known facts, not interpreting audio,
// which is why the speaker-attribution problem that sank transcripts doesn't
// apply. If anything goes wrong we fall back to the verbatim lines: a longer
// summary beats a failed seal.
async function condenseHummdingers(
  people: { name: string; hd: string; progress: string; obstacles: string; priorities: string; took: string[] }[],
  // Whose HIVE this seal is for — only used to attribute the model call's
  // cost in assistant_usage (migration 175).
  communityId: string,
): Promise<string[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey || people.length === 0) return [];

  const brief = people.map((person) => [
    `PERSON: ${person.name}`,
    person.hd ? `their HD: ${person.hd}` : '',
    person.progress ? `progress: ${person.progress}` : '',
    person.obstacles ? `stuck on / how HIVE can help: ${person.obstacles}` : '',
    person.priorities ? `focused on next: ${person.priorities}` : '',
    person.took.length ? `took on: ${person.took.join(' · ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  const system = [
    'You condense HIVE members\' monthly check-ins into one line each for a',
    'meeting recap that someone who missed the meeting will skim.',
    '',
    'Return ONLY a JSON array, one object per person, in the order given:',
    '[{"name": "Sara", "line": "Europe trip is locked in (Aug 6-Sep 8); still hunting for a mental-health person."}]',
    '',
    'Each line: one or two short sentences, under 200 characters. Lead with what',
    'changed or what they are working on, then what they need help with if',
    'anything. Use only the facts given — never invent. Skip a person entirely',
    'if they said nothing worth reporting. No markdown, no names inside the line.',
    'Exactly ONE object per person — never split someone across two entries.',
  ].join('\n');

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      // Sonnet 5, not Opus (Nat 2026-08-03: "we're hosting all of those costs").
      // $3/$15 per million against Opus's $5/$25 — and this job reads a day of
      // meeting activity and writes one line per person, which is squarely
      // mid-range work. Clive's own chat has been Haiku + Sonnet 5 all along;
      // this and the newsletter drafter were the two places still on Opus.
      //
      // max_tokens went 2000 → 8000 because Sonnet 5 THINKS BY DEFAULT and the
      // cap covers thinking AND the reply. Left at 2000 the reasoning would eat
      // the budget and the JSON would truncate mid-array — a silent failure
      // that looks like "the meeting had nothing in it".
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      output_config: { effort: 'medium' as const },
      system,
      messages: [{ role: 'user', content: brief }],
    });

    // Clive keeps receipts (migration 175). This runs from the nightly
    // auto-seal cron as well as the deck's Seal button — unattended spend.
    recordAssistantUsage({ functionName: 'seal-meeting', model: 'claude-sonnet-5', usage: response.usage, communityId });

    if ((response as { stop_reason?: string }).stop_reason === 'refusal') return [];

    const text = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    const rows = JSON.parse(json) as { name?: string; line?: string }[];
    // One line per person, whatever the model returns — a long check-in
    // sometimes comes back split across two entries for the same name.
    const byPerson = new Map<string, string>();
    rows.filter((row) => row?.name && row?.line).forEach((row) => {
      const name = String(row.name).trim();
      const line = String(row.line).trim();
      byPerson.set(name, byPerson.has(name) ? `${byPerson.get(name)} ${line}` : line);
    });
    return Array.from(byPerson, ([name, line]) => `${name}: ${line}`);
  } catch (error) {
    console.warn('HummDinger condensing failed; keeping the full check-in lines:', error);
    return [];
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
    const confirmedAbsenteeIds = Array.isArray(body.confirmed_absentee_ids)
      ? [...new Set(body.confirmed_absentee_ids.filter((id): id is string => typeof id === 'string' && !!id))]
      : [];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : pacificToday();

    // A nightly run must only seal on a REAL meeting day. Without this, any
    // Tuesday with a new board thread would mint a meeting record for a meeting
    // that never happened — worse than a missing summary, because it looks
    // real. Sealing from the deck stays unconditional; a human tapping Seal
    // knows there was a meeting.
    if (!body.date) {
      const { data: meetingDay } = await supabaseAdmin
        .from('events')
        .select('id')
        .eq('community_id', communityId)
        .eq('event_type', 'meeting')
        .eq('event_date', date)
        .limit(1);
      if ((meetingDay ?? []).length === 0) {
        return jsonResponse({ success: true, sealed: false, reason: 'No meeting on that date.' });
      }
    }

    // Auth: the daily cron calls with the service key; members seal from the deck.
    const authHeader = req.headers.get('Authorization') ?? '';
    let sealedBy: string | null = null;
    let mayConfirmAbsence = authHeader === `Bearer ${serviceKey}`;
    if (authHeader !== `Bearer ${serviceKey}`) {
      const auth = await verifySupabaseJwt(authHeader);
      if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
      const { data: membership } = await supabaseAdmin
        .from('community_memberships')
        .select('id, role')
        .eq('community_id', communityId)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (!membership) return errorResponse('Community membership required', 403);
      sealedBy = auth.userId;
      mayConfirmAbsence = membership.role === 'admin' || await isOwner(supabaseAdmin, auth.userId);
    }
    if (confirmedAbsenteeIds.length > 0 && !mayConfirmAbsence) {
      return errorResponse('Only a HIVE admin can confirm who missed the meeting.', 403);
    }
    if (confirmedAbsenteeIds.length > 0) {
      const { data: confirmedMembers } = await supabaseAdmin
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', communityId)
        .in('user_id', confirmedAbsenteeIds);
      if ((confirmedMembers ?? []).length !== confirmedAbsenteeIds.length) {
        return errorResponse('Every confirmed absentee must belong to this HIVE.', 422);
      }
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
        // The board name comes along: "Comedy" means nothing without
        // "Favorite Movies" in front of it (Nat 2026-07-25).
        .select('title, category:board_categories!category_id(name)')
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
    const threadRows = ((threadsRes.data ?? []) as any[])
      .filter((row) => row.title)
      .map((row) => ({ title: row.title as string, board: (row.category?.name ?? '') as string }));
    const threads = threadRows.map((row) => row.title);

    // The check-ins are the other half of the meeting: what people said they're
    // working on, stuck on, and focused on. They're what makes a recap readable
    // to someone who wasn't there, rather than a list of clicks.
    const [notesRow, ledgerRows, memberRows, wishRows] = await Promise.all([
      supabaseAdmin.from('communities').select('meeting_helper_notes, name').eq('id', communityId).maybeSingle(),
      supabaseAdmin.from('honey_pot_transactions').select('amount').eq('community_id', communityId),
      supabaseAdmin.from('community_memberships').select('user:profiles!user_id(id, name)').eq('community_id', communityId),
      supabaseAdmin.from('wishes')
        .select('title, description, user_id, is_spotlight, created_at')
        .eq('community_id', communityId).eq('status', 'public')
        .order('created_at', { ascending: false }),
    ]);
    const deckNotes = ((notesRow.data as any)?.meeting_helper_notes ?? {}) as Record<string, string>;
    // With three HIVEs, a recap has to say whose meeting it was. Legacy spellings
    // of the original all collapse to "HIVE" (Nat 2026-08-02).
    const rawHiveName = ((notesRow.data as any)?.name ?? '').trim();
    const hiveName = ['', 'hive', 'the hive', 'h.i.v.e.', 'the h.i.v.e.'].includes(rawHiveName.toLowerCase())
      ? 'HIVE'
      : rawHiveName;
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

    const [nextMeetingRows, upcomingRows, focusRows] = await Promise.all([
      supabaseAdmin.from('events')
        .select('title, event_date, event_time')
        .eq('community_id', communityId).eq('event_type', 'meeting')
        .gt('event_date', date).order('event_date', { ascending: true }).limit(1),
      supabaseAdmin.from('events')
        .select('title, event_date, end_date, event_type')
        .eq('community_id', communityId)
        .gt('event_date', date).order('event_date', { ascending: true }).limit(20),
      supabaseAdmin.from('board_posts')
        .select('title, created_at, category:board_categories!category_id(name)')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .order('created_at', { ascending: false }).limit(30),
    ]);
    const nextMeeting = ((nextMeetingRows.data ?? []) as any[])[0] ?? null;
    // Same exclusions the deck's calendar uses: meetings, birthdays, and
    // out-of-town stretches aren't hangs.
    const upcomingHangs = ((upcomingRows.data ?? []) as any[]).filter((event) => (
      event.event_type !== 'meeting'
      && event.event_type !== 'birthday'
      && !event.end_date
      && !/\b(out of town|away|trip|travel|galavant)/i.test(event.title ?? '')
    )).slice(0, 6);
    const helpFocus = ((focusRows.data ?? []) as any[])
      .filter((row) => /helper/i.test(row.category?.name ?? '') && !/ideas/i.test(row.title ?? ''))
      .map((row) => (row.title as string).replace(/^.*HIVE Help(?:ers)?\s*[—–-]+\s*/i, ''))[0] ?? null;

    const { data: checkInRows } = await supabaseAdmin
      .from('survey_responses')
      .select('answers, submitted_at, user_id, user:profiles!user_id(name), survey:surveys!survey_id(title)')
      // Scoped, at last. Every other query in this function filters on the
      // community and this one never did — so sealing a Tech HIVE meeting swept
      // in OG members' private check-ins (what they are stuck on, what they
      // want help with, by first name), wrote them into the HummDingers section
      // of Tech's summary and fed them to Clive. The nightly cron did it
      // unattended. The only filter was on the survey TITLE, and every HIVE's
      // monthly check-in matches /check-in/i.
      .eq('community_id', communityId)
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

    // One meeting record per date: merge into an existing row (imported
    // transcript stays as the detail layer) or create a fresh one.
    const { data: existingRows } = await supabaseAdmin
      .from('meetings')
      .select('id, summary, transcript_raw')
      .eq('community_id', communityId)
      .eq('date', date)
      .order('created_at', { ascending: true });
    const existing = (existingRows ?? []).find((row) => row.transcript_raw) ?? (existingRows ?? [])[0] ?? null;

    /**
     * "Nothing happened" has to mean nothing was KEPT — not nothing was
     * clicked.
     *
     * `details` is app activity: an event penciled in, a to-do handed out, a
     * note on a wish, a thread opened. A meeting can have none of that and
     * still be a whole meeting, and on 2026-08-19 one was: Nat recorded the
     * room, the transcript came back from AssemblyAI and landed on the row,
     * and Seal answered "Hmm, try sealing again" forever — because sealing
     * counted the clicking and not the recording.
     *
     * Nat, the same minute: *"I would like the transcripts to not get lost and
     * like the notes on the meeting helper to not get lost."* So a transcript
     * on the record counts, and so does anything she typed into the deck.
     */
    const wroteItDown = !!(existing?.transcript_raw ?? '').trim()
      || Object.values(deckNotes).some((value) => typeof value === 'string' && value.trim());

    if (details.length === 0 && !wroteItDown) {
      return jsonResponse({
        success: true,
        sealed: false,
        reason: 'There is nothing to seal yet — no transcript, no deck notes, and nothing done in the app today.',
      });
    }

    const month = monthName(date);
    const todoPeople = new Set(todos.map((todo) => todo.assigned_to).filter(Boolean)).size;
    // The tally is a sentence about what was CLICKED, so a night whose whole
    // record is a recording gets no tally rather than a full stop on its own.
    const tally = [
      events.length ? `${events.length} event${events.length === 1 ? '' : 's'} penciled in` : null,
      todoGroups.size ? `${todoGroups.size} to-do${todoGroups.size === 1 ? '' : 's'} handed out across ${todoPeople} list${todoPeople === 1 ? '' : 's'}` : null,
      notes.length ? `${notes.length} wish note${notes.length === 1 ? '' : 's'}` : null,
      granted.length ? `${granted.length} wish${granted.length === 1 ? '' : 'es'} granted` : null,
      threads.length ? `${threads.length} thread${threads.length === 1 ? '' : 's'} opened` : null,
    ].filter(Boolean).join(' · ');
    const summaryText = tally
      ? `Live notes from the ${month} meeting — written in the app as the night unfolded. ${tally}.`
      : `Live notes from the ${month} meeting.`;

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
      ...threadRows.map((row) => (row.board ? `${row.board} → ${row.title}` : `New thread: ${row.title}`)),
    ];
    if (newsLines.length > 0) sections.push({ title: 'News from Nat', lines: newsLines });

    const appLines = bulletsFrom(deckNotes.appnews);
    if (appLines.length > 0) sections.push({ title: 'App updates', lines: appLines });

    sections.push({
      title: 'Treasurer',
      lines: [`Honey Pot balance: $${potBalance.toFixed(2)}`],
    });

    // The deck's Plan-the-Meet-Ups slide, in the same order: when we meet next,
    // what the HIVE Help focus is, and what's already on the calendar.
    const prettyDate = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
      });
    };
    // 17:30 is a database value, not something anyone says out loud.
    const prettyTime = (value: string) => {
      const [rawHour, minute] = value.split(':');
      const hour = Number(rawHour);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const twelve = hour % 12 === 0 ? 12 : hour % 12;
      return `${twelve}:${minute} ${suffix}`;
    };
    const meetupLines: string[] = [];
    if (nextMeeting) {
      meetupLines.push(`Next HIVE meeting: ${prettyDate(nextMeeting.event_date)}${nextMeeting.event_time ? ` · ${prettyTime(nextMeeting.event_time)}` : ''}`);
    }
    if (helpFocus) meetupLines.push(`HIVE Help focus: ${helpFocus}`);
    if (upcomingHangs.length > 0) {
      meetupLines.push('Upcoming HIVE hangs:');
      upcomingHangs.forEach((hang) => {
        meetupLines.push(`    ${hang.title} — ${prettyDate(hang.event_date)}`);
      });
    }
    meetupLines.push(...bulletsFrom(deckNotes.meetups));
    if (meetupLines.length > 0) sections.push({ title: 'Plan the Meet Ups', lines: meetupLines });

    // One block per person: their HD, their POP, and what they walked away with.
    const hdLines: string[] = [];
    const people: { name: string; hd: string; progress: string; obstacles: string; priorities: string; took: string[] }[] = [];
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

      people.push({ name: entry.name, hd: hd ?? '', progress, obstacles, priorities, took });
      hdLines.push(`${entry.name}${hd ? ` — ${hd}` : ''}`);
      if (progress) hdLines.push(`    Progress: ${progress}`);
      if (obstacles) hdLines.push(`    Obstacles / how HIVE can help: ${obstacles}`);
      if (priorities) hdLines.push(`    Priorities: ${priorities}`);
      if (took.length > 0) hdLines.push(`    Took on: ${took.join(' · ')}`);
    });
    // One tight line per person, not their check-in pasted in full. This is the
    // only place a model earns its keep here: everything else in this summary is
    // a fact to arrange, but "36 lines of verbatim POP" -> "Sara: Europe trip is
    // locked in (Aug 6-Sep 8); still hunting for a mental-health person" is
    // genuine condensing (Nat 2026-07-25: "it's a summary, not word for word").
    const condensed = await condenseHummdingers(people, communityId);
    if (condensed.length > 0) {
      sections.push({ title: 'HummDingers', lines: condensed });
    } else if (hdLines.length > 0) {
      sections.push({ title: "HummDingers — everyone's POP", lines: hdLines });
    }

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
      title: `${month} ${hiveName} Meeting`,
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

    // Sealing can only create a held Nat preview. The recap function has no
    // member-send path without a separate owner approval request.
    let recapHold: Record<string, unknown> | null = null;
    if (confirmedAbsenteeIds.length > 0 && meetingId) {
      try {
        const recapResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/post-meeting-recap`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meeting_id: meetingId,
            confirmed_absentee_ids: confirmedAbsenteeIds,
          }),
        });
        recapHold = await recapResponse.json();
        if (!recapResponse.ok) console.error('Post-meeting recap hold failed:', recapHold);
      } catch (recapError) {
        console.error('Post-meeting recap hold failed:', recapError);
        recapHold = { held: false, error: 'The meeting sealed, but its recap preview could not be created.' };
      }
    }

    return jsonResponse({
      success: true,
      sealed: true,
      meetingId,
      recapHold,
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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

// The newsletter and the meeting summary are the SAME artifact pointed at
// different dates, so this returns the same `sections[]` shape seal-meeting
// produces and the app renders both with SummarySections. Nothing here is
// written twice: everything is harvested from where members already put it —
// the Newsletter thread, Compliment Corner, the Helpers log, their to-dos,
// their check-ins (Nat 2026-07-25).
//
// Read-only by design. It drafts; Nat writes.

interface DraftRequest {
  communityId: string;
  /** Local date the draft is "as of". Defaults to today in Pacific time. */
  date?: string;
}

function pacificToday() {
  return new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
}

function firstName(name?: string | null) {
  return (name ?? '').trim().split(/\s+/)[0] || 'someone';
}

function prettyDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

// 17:30 is a database value, not something anyone says out loud.
function prettyTime(value: string) {
  const [rawHour, minute] = value.split(':');
  const hour = Number(rawHour);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${minute} ${suffix}`;
}

/**
 * One line per person for "Who's up to what". Same idea as the meeting recap's
 * condenser, but newsletter voice: what they're chasing and where a neighbor
 * could lend a hand. Falls back to no section rather than a wall of text — a
 * short draft beats a bloated one.
 */
async function condensePeople(
  people: { name: string; hd: string; progress: string; needs: string; helped: string[] }[],
): Promise<string[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey || people.length === 0) return [];

  const brief = people.map((person) => [
    `PERSON: ${person.name}`,
    person.hd ? `what they're chasing: ${person.hd}` : '',
    person.progress ? `recent progress: ${person.progress}` : '',
    person.needs ? `could use help with: ${person.needs}` : '',
    person.helped.length ? `checked off: ${person.helped.join(' · ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  const system = [
    "You condense HIVE members' updates into one warm line each for a community",
    'newsletter that everyone skims over coffee.',
    '',
    'Return ONLY a JSON array, one object per person, in the order given:',
    '[{"name": "Sara", "line": "Europe is locked in for Aug 6-Sep 8 — still hunting for friendly faces and cheap places to stay along the way."}]',
    '',
    'Each line: one sentence, under 180 characters. Lead with what they are up',
    'to, then what they could use a hand with. Use only the facts given — never',
    'invent. Skip a person entirely if there is nothing worth reporting.',
    'Exactly ONE object per person — never split someone across two entries.',
    'No markdown, no names inside the line.',
  ].join('\n');

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: brief }],
    });
    if ((response as { stop_reason?: string }).stop_reason === 'refusal') return [];

    const text = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    const rows = JSON.parse(json) as { name?: string; line?: string }[];
    const byPerson = new Map<string, string>();
    rows.filter((row) => row?.name && row?.line).forEach((row) => {
      const name = String(row.name).trim();
      const line = String(row.line).trim();
      byPerson.set(name, byPerson.has(name) ? `${byPerson.get(name)} ${line}` : line);
    });
    return Array.from(byPerson, ([name, line]) => `${name}: ${line}`);
  } catch (error) {
    console.warn('Newsletter condensing failed; skipping the people section:', error);
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
    const body = (await req.json()) as DraftRequest;
    const communityId = body.communityId;
    if (!communityId) return errorResponse('Missing communityId', 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : pacificToday();

    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${serviceKey}`) {
      const auth = await verifySupabaseJwt(authHeader);
      if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
    }

    // The newsletter is a CALENDAR thing, not a meeting thing: it goes out on
    // the 1st and covers the month that just ended. Meetings wander (usually
    // 2nd Wednesday, but availability moves them), so anchoring the draft to
    // the last meeting would leave the first week or two of a month out of the
    // newsletter entirely (Nat 2026-07-25).
    //
    // Run it in the first week of a month and it covers the previous month;
    // run it mid-month and it covers this month so far.
    const [year, month, day] = date.split('-').map(Number);
    const coversPreviousMonth = day <= 7;
    const startYear = coversPreviousMonth && month === 1 ? year - 1 : year;
    const startMonth = coversPreviousMonth ? (month === 1 ? 12 : month - 1) : month;
    const cycleStart = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const cycleEnd = coversPreviousMonth
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : null;
    const startIso = `${cycleStart}T00:00:00Z`;
    // Only bound the top end when we're reporting a finished month — a
    // mid-month draft should include everything up to right now.
    const endIso = cycleEnd ? `${cycleEnd}T00:00:00Z` : null;
    const withinWindow = (timestamp?: string | null) => (
      !!timestamp && timestamp >= startIso && (!endIso || timestamp < endIso)
    );

    const [
      nextMeetingRows,
      upcomingRows,
      threadRows,
      memberRows,
      wishRows,
      grantedRows,
      todoRows,
      checkInRows,
    ] = await Promise.all([
      supabaseAdmin.from('events')
        .select('title, event_date, event_time')
        .eq('community_id', communityId).eq('event_type', 'meeting')
        .gte('event_date', date).order('event_date', { ascending: true }).limit(1),
      supabaseAdmin.from('events')
        .select('title, event_date, end_date, event_type, related_user_id')
        .eq('community_id', communityId)
        .gte('event_date', date).order('event_date', { ascending: true }).limit(30),
      supabaseAdmin.from('board_posts')
        .select('id, title, content, created_at, author_id, category:board_categories!category_id(name)')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .order('created_at', { ascending: false }).limit(60),
      supabaseAdmin.from('community_memberships')
        .select('user:profiles!user_id(id, name)')
        .eq('community_id', communityId),
      supabaseAdmin.from('wishes')
        .select('user_id, title, description, is_spotlight, status')
        .eq('community_id', communityId).neq('status', 'fulfilled'),
      supabaseAdmin.from('wishes')
        .select('title, description, fulfilled_at, user:profiles!user_id(name)')
        .eq('community_id', communityId)
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', startIso)
        .order('fulfilled_at', { ascending: false }).limit(20),
      supabaseAdmin.from('action_items')
        .select('description, completed, completed_at, assignee:profiles!assigned_to(name)')
        .eq('community_id', communityId)
        .eq('completed', true)
        .gte('completed_at', startIso).limit(60),
      supabaseAdmin.from('survey_responses')
        .select('answers, submitted_at, user_id, user:profiles!user_id(name), survey:surveys!survey_id(title)')
        .gte('submitted_at', new Date(Date.parse(startIso) - 45 * 24 * 3600_000).toISOString())
        .order('submitted_at', { ascending: false }).limit(40),
    ]);

    const nextMeeting = ((nextMeetingRows.data ?? []) as any[])[0] ?? null;
    // Same exclusions the deck's calendar uses: meetings, birthdays, and
    // out-of-town stretches aren't hangs.
    const upcoming = (upcomingRows.data ?? []) as any[];
    const upcomingHangs = upcoming.filter((event) => (
      event.event_type !== 'meeting'
      && event.event_type !== 'birthday'
      && !event.end_date
      && !/\b(out of town|away|trip|travel|galavant)/i.test(event.title ?? '')
    )).slice(0, 8);
    const birthdays = upcoming.filter((event) => event.event_type === 'birthday').slice(0, 6);

    const posts = (threadRows.data ?? []) as any[];
    const helpFocus = posts
      .filter((row) => /helper/i.test(row.category?.name ?? '') && !/ideas/i.test(row.title ?? ''))
      .map((row) => (row.title as string).replace(/^.*HIVE Help(?:ers)?\s*[—–-]+\s*/i, ''))[0] ?? null;

    const memberNames = new Map<string, string>();
    ((memberRows.data ?? []) as any[]).forEach((row) => {
      if (row.user?.id) memberNames.set(row.user.id, firstName(row.user.name ?? 'Someone'));
    });

    // Replies members left this cycle on the threads the midway check-in posts
    // into. This is the whole point: they answered a friendly prompt, and it
    // shows up here without anyone re-typing it.
    const harvest = async (match: RegExp, limit = 30) => {
      const thread = posts.find((row) => match.test(row.title ?? ''));
      if (!thread) return [] as { name: string; content: string }[];
      const { data } = await supabaseAdmin
        .from('board_replies')
        .select('content, created_at, author_id')
        .eq('post_id', thread.id)
        .gte('created_at', startIso)
        .order('created_at', { ascending: true })
        .limit(limit);
      return ((data ?? []) as any[])
        .filter((reply) => withinWindow(reply.created_at))
        .map((reply) => ({
          name: memberNames.get(reply.author_id) ?? 'Someone',
          content: String(reply.content ?? '').trim(),
        }))
        .filter((reply) => reply.content.length > 0 && !/^\+1\b/.test(reply.content));
    };

    const [shoutOuts, compliments, helperLogs] = await Promise.all([
      harvest(/newsletter/i),
      harvest(/compliment/i),
      (async () => {
        const focusThread = posts.find((row) => (
          /helper/i.test(row.category?.name ?? '') && !/ideas/i.test(row.title ?? '')
        ));
        if (!focusThread) return [] as { name: string; content: string }[];
        const { data } = await supabaseAdmin
          .from('board_replies')
          .select('content, created_at, author_id')
          .eq('post_id', focusThread.id)
          .gte('created_at', startIso)
          .order('created_at', { ascending: true })
          .limit(30);
        return ((data ?? []) as any[])
          .filter((reply) => withinWindow(reply.created_at))
          .map((reply) => ({
            name: memberNames.get(reply.author_id) ?? 'Someone',
            content: String(reply.content ?? '').trim(),
          }))
          .filter((reply) => reply.content.length > 0 && !/^\+1\b/.test(reply.content));
      })(),
    ]);

    // Same rule the app uses everywhere: your starred wish, else your newest.
    const hdByUser = new Map<string, string>();
    ((wishRows.data ?? []) as any[]).forEach((wish) => {
      const label = (wish.title || wish.description || '').trim();
      if (!label) return;
      if (wish.is_spotlight) hdByUser.set(wish.user_id, label);
      else if (!hdByUser.has(wish.user_id)) hdByUser.set(wish.user_id, label);
    });

    const doneByUser = new Map<string, string[]>();
    ((todoRows.data ?? []) as any[]).forEach((todo) => {
      if (!withinWindow(todo.completed_at)) return;
      const name = todo.assignee?.name ? firstName(todo.assignee.name) : null;
      if (!name) return;
      const list = doneByUser.get(name) ?? [];
      if (list.length < 4) list.push(String(todo.description ?? '').trim());
      doneByUser.set(name, list);
    });

    const answerOf = (answers: Record<string, unknown>, key: string) => {
      const value = answers[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const seen = new Set<string>();
    const people: { name: string; hd: string; progress: string; needs: string; helped: string[] }[] = [];
    ((checkInRows.data ?? []) as any[])
      .filter((row) => /check-in/i.test(row.survey?.title ?? ''))
      .forEach((row) => {
        if (seen.has(row.user_id)) return;
        seen.add(row.user_id);
        const name = row.user?.name ? firstName(row.user.name) : 'Someone';
        const answers = (row.answers ?? {}) as Record<string, unknown>;
        const hd = hdByUser.get(row.user_id) ?? '';
        const progress = answerOf(answers, 'q_pop_progress');
        const needs = answerOf(answers, 'q_pop_obstacles');
        const helped = doneByUser.get(name) ?? [];
        if (!hd && !progress && !needs && helped.length === 0) return;
        people.push({ name, hd, progress, needs, helped });
      });

    const sections: { title: string; lines: string[] }[] = [];

    // What's coming up leads — someone skimming needs the next date more than
    // they need the history (same call as Clive's recap shape).
    const comingUp: string[] = [];
    if (nextMeeting) {
      comingUp.push(
        `Next HIVE meeting: ${prettyDate(nextMeeting.event_date)}`
        + (nextMeeting.event_time ? ` · ${prettyTime(nextMeeting.event_time)}` : '')
      );
    }
    if (helpFocus) comingUp.push(`HIVE Help focus: ${helpFocus}`);
    if (upcomingHangs.length > 0) {
      comingUp.push('Upcoming HIVE hangs:');
      upcomingHangs.forEach((hang) => comingUp.push(`    ${hang.title} — ${prettyDate(hang.event_date)}`));
    }
    if (birthdays.length > 0) {
      comingUp.push('Birthdays:');
      birthdays.forEach((event) => comingUp.push(`    ${event.title} — ${prettyDate(event.event_date)}`));
    }
    if (comingUp.length > 0) sections.push({ title: "What's coming up", lines: comingUp });

    if (shoutOuts.length > 0) {
      sections.push({
        title: 'Shout-outs & mentions',
        lines: shoutOuts.map((item) => `${item.name}: ${item.content}`),
      });
    }

    if (compliments.length > 0) {
      sections.push({
        title: 'Compliment Corner 💐',
        lines: compliments.map((item) => `${item.name}: ${item.content}`),
      });
    }

    if (helperLogs.length > 0) {
      sections.push({
        title: helpFocus ? `HIVE Help — ${helpFocus}` : 'HIVE Help',
        lines: helperLogs.map((item) => `${item.name}: ${item.content}`),
      });
    }

    const grantedLines = ((grantedRows.data ?? []) as any[])
      .filter((wish) => withinWindow(wish.fulfilled_at))
      .map((wish) => {
      const owner = wish.user?.name ? firstName(wish.user.name) : 'Someone';
        return `${owner}: ${(wish.title || wish.description || '').slice(0, 120)}`;
      });
    if (grantedLines.length > 0) sections.push({ title: 'Wishes granted 🌟', lines: grantedLines });

    // New threads worth telling people about — the boards move faster than
    // anyone checks them.
    const newThreads = posts
      .filter((row) => withinWindow(row.created_at))
      .filter((row) => !/newsletter|compliment/i.test(row.title ?? ''))
      .slice(0, 8)
      .map((row) => (row.category?.name ? `${row.category.name} → ${row.title}` : String(row.title)));
    if (newThreads.length > 0) sections.push({ title: 'New on the boards', lines: newThreads });

    const condensed = await condensePeople(people);
    if (condensed.length > 0) sections.push({ title: "Who's up to what", lines: condensed });

    return jsonResponse({
      success: true,
      date,
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      sections,
      counts: {
        shout_outs: shoutOuts.length,
        compliments: compliments.length,
        helper_logs: helperLogs.length,
        granted: grantedLines.length,
        people: condensed.length,
      },
    });
  } catch (error) {
    console.error('draft-newsletter failed:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to draft the newsletter', 500);
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { recordAssistantUsage } from '../_shared/metering.ts';

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
  /**
   * Which month to recap, as YYYY-MM. The recap of a month goes out in the
   * month after it (Nat 2026-08-03), so this defaults to last month — but it
   * defaults rather than guesses. It used to be inferred from the day of the
   * month, which meant drafting on the 7th recapped July and drafting on the
   * 8th silently recapped August-so-far instead.
   */
  month?: string;
  /**
   * This month's entries from lib/appNews.ts — the living what's-new list the
   * app already shows every member. Sent by the caller because the edge
   * function can't import from the app, and safe to trust because only the
   * owner can reach this and the list is public-facing by design.
   */
  appNews?: string[];
  /**
   * "Pardon our dust, we're expanding — here's what that means for you." The
   * same paragraphs the app shows on the HIVE-Wide page and at sign-in, sent
   * from lib/hiveWide.ts so one edit changes all three.
   */
  expansionNote?: string[];
  /**
   * Writing the letter takes the better part of a minute; gathering takes about
   * a second. The screen asks for the facts first so there's something to read,
   * then asks again for the letter. Defaults true so any other caller still
   * gets the whole thing in one go.
   */
  includeProse?: boolean;
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
 * Turn the gathered facts into an actual letter.
 *
 * The outline version was "not incorrect... just very very literal" (Nat
 * 2026-07-25) — a data dump, where hers is a warm monthly letter with a
 * particular shape and a particular voice. So the facts stay the source of
 * truth and this writes them up; if it fails, the outline is still there.
 *
 * The one thing it must never do is put words in Nat's mouth. "A Note from
 * Nat" comes back as a bracketed placeholder for her to fill, and anything not
 * in the facts is left as a bracket rather than invented.
 */
async function writeNewsletter(
  month: string,
  factsText: string,
  // Whose HIVE's newsletter — only used to attribute the model call's cost
  // in assistant_usage (migration 175).
  communityId: string,
): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey || !factsText.trim()) return null;

  const system = [
    "You draft the HIVE's monthly newsletter for Nat, who runs a 12-person",
    'community. She pastes your draft into Wix, tweaks it, and sends it. Write',
    'the letter she would write — not a summary of data.',
    '',
    'WHO READS IT (Nat, 2026-08-03, and this is the thing the draft kept getting',
    'wrong). Two people:',
    '',
    '  1. Someone who liked the sound of the HIVE but for whom January was the',
    '     wrong time. They know nobody. Nat names her dad and her sister\'s',
    '     husband. They want to know what kind of people we are, how the thing is',
    '     structured, and what sort of projects it takes on.',
    '  2. A member, halfway through the month, who reads it and thinks "oh yeah,',
    '     I said I was going to do that and I haven\'t yet."',
    '',
    'Neither of them wants a list of who did what. A roster of first names means',
    'nothing to the first reader and nothing new to the second. Write about what',
    'the HIVE is doing and becoming; use the specifics as evidence of that, not',
    'as the point.',
    '',
    'THIS IS PUBLIC. Anyone can read it. Everything you have been given has been',
    'opted in by the person it belongs to — so use it warmly, and never reach',
    'past it. Do not describe someone you cannot name, do not hint, do not write',
    '"one member" or "somebody in the HIVE". If the facts are thin, write a',
    'shorter, warmer letter. Short and generous beats padded and cagey.',
    '',
    'HER VOICE: warm, chatty, a little goofy. Short paragraphs. Exclamation',
    'points and em-dashes. Emoji sprinkled, never wall-to-wall. She says',
    '"Hivers", "the buzz", "keep the HIVE humming". She addresses everyone',
    'directly as "you". She celebrates people by name.',
    '',
    'HER STRUCTURE — use these headings, in this order, skipping any with',
    'nothing to say:',
    '  Yellow!            (greeting — a sentence or two of hello)',
    `  Here's the buzz from ${month}`,
    '  HIVE Hangs         (what happened, then what is coming up)',
    '  HIVE Help          (the focus, and a nudge to log it on 15min HIVE Helpers)',
    '  Around the HIVE    (app and community updates)',
    '  Wishes granted     (only if there are any)',
    '  Shout-outs         (only if there are any)',
    '  Compliment Corner  (only if there are any)',
    '  Keep the HIVE humming  (a short numbered list of 4-6 easy asks)',
    '  A Note from Nat',
    '',
    'HARD RULES:',
    '- Use ONLY the facts given. Never invent an event, a name, a date, or a',
    '  detail. If a section has no facts, leave it out entirely.',
    '- Never write "A Note from Nat" yourself. Output exactly this under that',
    '  heading: [Your note here, Nat 💛]',
    '- Where you need something only Nat knows, write it as a bracket, e.g.',
    '  [add anything I missed] — do not guess.',
    '- Plain text, no markdown asterisks or hashes. Headings on their own line.',
    '- Sign off: "Love in the biggest way," then "Nat" on the next line.',
    '- Keep it skimmable. Someone reads this over coffee.',
  ].join('\n');

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      // Sonnet 5, not Opus (Nat 2026-08-03). Writing a warm monthly recap from
      // a list of facts is mid-range work, and this runs every cycle.
      //
      // max_tokens went 4000 → 12000: Sonnet 5 thinks by default and the cap
      // covers thinking and the newsletter together. A truncated newsletter is
      // worse than a slow one.
      model: 'claude-sonnet-5',
      max_tokens: 12000,
      output_config: { effort: 'medium' as const },
      system,
      messages: [{
        role: 'user',
        content: `Everything that happened in the HIVE this cycle:\n\n${factsText}\n\nWrite the ${month} newsletter.`,
      }],
    });
    // Clive keeps receipts (migration 175): fire-and-forget, never blocks.
    recordAssistantUsage({ functionName: 'draft-newsletter', model: 'claude-sonnet-5', usage: response.usage, communityId });

    if ((response as { stop_reason?: string }).stop_reason === 'refusal') return null;
    return response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim() || null;
  } catch (error) {
    console.warn('Newsletter writing failed; the outline still stands:', error);
    return null;
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

    // Being signed in used to be the whole test, and the id of the HIVE to read
    // came from whoever was asking. Any member could therefore have asked this
    // for a HIVE they had never been in and received its wishes, shout-outs and
    // meeting summary — because everything below reads with the service key,
    // which walks straight past row-level security. Found 2026-08-03, unused.
    //
    // The newsletter speaks FOR the HIVE to the outside world, so drafting it is
    // an owner's job, not an admin's. Nic runs OG HIVE with Nat and shouldn't be
    // able to publish under its name; nor should any admin of any HIVE we add.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${serviceKey}`) {
      const auth = await verifySupabaseJwt(authHeader);
      if (isAuthError(auth)) return errorResponse(auth.error, auth.status);

      const { data: caller } = await supabaseAdmin
        .from('profiles')
        .select('is_owner')
        .eq('id', auth.userId)
        .maybeSingle();

      if (!caller?.is_owner) {
        // Deliberately the same words whether they're not an owner or the HIVE
        // doesn't exist — a refusal shouldn't teach you what is behind it.
        return errorResponse('The newsletter is drafted by the HIVE owner.', 403);
      }
    }

    // A HIVE that cannot publish outward has no public newsletter, whatever any
    // single item inside it says. The ceiling is the backstop for a mis-tapped
    // setting (migration 125), and it has to hold here too — this function is
    // the one place that assembles a HIVE's contents into something that leaves.
    const { data: hive } = await supabaseAdmin
      .from('communities')
      .select('name, max_share_scope')
      .eq('id', communityId)
      .maybeSingle();

    if (!hive) return errorResponse('The newsletter is drafted by the HIVE owner.', 403);

    if (hive.max_share_scope !== 'public') {
      return jsonResponse({
        success: true,
        blocked: true,
        month: null,
        prose: null,
        sections: [],
        reason: `${hive.name} keeps its contents inside the HIVE, so there's nothing to publish outward yet. `
          + `Raise what it's allowed to share and this will fill in.`,
      });
    }

    // The newsletter is a CALENDAR thing, not a meeting thing: a month's recap
    // goes out in the month after it. Meetings wander (usually 2nd Wednesday,
    // but availability moves them), so anchoring to the last meeting would leave
    // the first week or two of a month out of the letter (Nat 2026-07-25).
    //
    // It used to work this out from the day of the month — the 7th or earlier
    // meant "last month", the 8th onwards meant "this month so far". So the same
    // button produced the July recap on Friday and an August fragment on
    // Saturday, without saying so. The month is now stated, and only defaults.
    const [thisYear, thisMonth] = date.split('-').map(Number);
    const requested = /^\d{4}-\d{2}$/.test(body.month ?? '') ? body.month! : null;
    const startYear = requested
      ? Number(requested.slice(0, 4))
      : (thisMonth === 1 ? thisYear - 1 : thisYear);
    const startMonth = requested
      ? Number(requested.slice(5, 7))
      : (thisMonth === 1 ? 12 : thisMonth - 1);
    const cycleStart = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endYear = startMonth === 12 ? startYear + 1 : startYear;
    const endMonth = startMonth === 12 ? 1 : startMonth + 1;
    const cycleEnd = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    const startIso = `${cycleStart}T00:00:00Z`;
    // A whole month, always — a recap of a finished month has a end as well as
    // a beginning, and half of one was never what anybody wanted.
    const endIso = `${cycleEnd}T00:00:00Z`;
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
      grantedCountRows,
      todoRows,
      checkInRows,
      pastEventRows,
    ] = await Promise.all([
      // Meetings are members-only by nature, so the public newsletter never
      // names one. Kept as a query only so the shape below stays readable.
      supabaseAdmin.from('events')
        .select('title, event_date, event_time')
        .eq('community_id', communityId).eq('event_type', 'meeting')
        .eq('visibility', 'public')
        .gte('event_date', date).order('event_date', { ascending: true }).limit(1),
      // "Everyone's invited" only. Anything left HIVErs Only never leaves the
      // members' side — a privacy default has to fail closed.
      supabaseAdmin.from('events')
        .select('title, event_date, end_date, event_type, related_user_id')
        .eq('community_id', communityId)
        .eq('visibility', 'public')
        .gte('event_date', date).order('event_date', { ascending: true }).limit(30),
      supabaseAdmin.from('board_posts')
        .select('id, title, content, created_at, author_id, visibility, category:board_categories!category_id(name)')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .order('created_at', { ascending: false }).limit(60),
      supabaseAdmin.from('community_memberships')
        .select('user:profiles!user_id(id, name)')
        .eq('community_id', communityId),
      supabaseAdmin.from('wishes')
        .select('user_id, title, description, is_spotlight, status')
        .eq('community_id', communityId).neq('status', 'fulfilled'),
      // Granted wishes carry a name and what that person needed, so they only
      // travel as far as the wisher chose. All 49 wishes are 'hive' today, which
      // is why July's letter counts them rather than lists them: momentum is
      // Nat's to celebrate, the details are each member's to offer.
      supabaseAdmin.from('wishes')
        .select('title, description, fulfilled_at, share_scope, user:profiles!user_id(name)')
        .eq('community_id', communityId)
        .eq('status', 'fulfilled')
        .eq('share_scope', 'public')
        .gte('fulfilled_at', startIso)
        .order('fulfilled_at', { ascending: false }).limit(20),
      // Counted, never named — how many wishes came true is a fact about the
      // HIVE, not about anybody in it.
      supabaseAdmin.from('wishes')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', communityId)
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', startIso),
      supabaseAdmin.from('action_items')
        .select('description, completed, completed_at, assignee:profiles!assigned_to(name)')
        .eq('community_id', communityId)
        .eq('completed', true)
        .gte('completed_at', startIso).limit(60),
      supabaseAdmin.from('survey_responses')
        .select('answers, submitted_at, user_id, user:profiles!user_id(name), survey:surveys!survey_id(title)')
        // Same missing filter as seal-meeting had. This result is unused today,
        // so it leaked nothing — but the newsletter is PUBLIC, and one edit away
        // from publishing another HIVE's private check-ins to the website.
        .eq('community_id', communityId)
        .gte('submitted_at', new Date(Date.parse(startIso) - 45 * 24 * 3600_000).toISOString())
        .order('submitted_at', { ascending: false }).limit(40),
      // Hangs that already HAPPENED. Nat's newsletter reports on the month as
      // much as it looks ahead ("Hivers were showing up for each other all
      // over!"), and a draft with only upcoming events can't write that.
      supabaseAdmin.from('events')
        .select('title, event_date, event_type, description, location')
        .eq('community_id', communityId)
        .eq('visibility', 'public')
        .gte('event_date', cycleStart).lt('event_date', cycleEnd)
        .order('event_date', { ascending: true }).limit(30),
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
    // share_scope = 'public' is the whole gate (migration 129). A reply written
    // for the HIVE stays in the HIVE, however good it is — the newsletter is an
    // offer, not a levy on everything anyone typed this month.
    const harvest = async (match: RegExp, limit = 30) => {
      const thread = posts.find((row) => match.test(row.title ?? ''));
      if (!thread) return [] as { name: string; content: string }[];
      // Posting in THIS thread is the consent.
      //
      // This asked for `share_scope = 'public'`, and nothing in the app has
      // ever set that: all 218 replies in the database are 'hive', which is the
      // column's default and the only value any composer writes. So the harvest
      // has always come back empty, and the thread that says "drop it in this
      // thread and it goes straight into the newsletter" has never once been
      // telling the truth.
      //
      // The extra flag was the wrong shape for this. These threads are created
      // by the app with copy that states exactly where the words are going —
      // that IS the informed choice, made when you type the reply, not a second
      // switch nobody was ever shown.
      const { data } = await supabaseAdmin
        .from('board_replies')
        .select('content, created_at, author_id, share_scope')
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
        // Same as above — the HIVE Helpers board says on its face that what you
        // log there goes into recaps and newsletters.
        const { data } = await supabaseAdmin
          .from('board_replies')
          .select('content, created_at, author_id, share_scope')
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

    const pastHangs = ((pastEventRows.data ?? []) as any[]).filter((event) => (
      event.event_type !== 'meeting' && event.event_type !== 'birthday'
    ));
    if (pastHangs.length > 0) {
      sections.push({
        title: 'Hangs that happened',
        lines: pastHangs.map((event) => (
          `${event.title} — ${prettyDate(event.event_date)}${event.location ? ` · ${event.location}` : ''}`
        )),
      });
    }

    // The meeting summary used to feed two sections here, and both were wrong.
    //
    // "News from the meeting" was a members-only artifact — it carried a line
    // about Nat and Lucas not having a hard out, which means nothing to a
    // stranger, and it had already harvested the month's new board threads, so
    // every thread printed twice: once here and once under New on the boards.
    //
    // "Around the HIVE" was frozen at whatever the deck happened to say on the
    // night of the meeting. July's meeting was the 25th, so the July recap would
    // have boasted about things that shipped in June and missed The Buzz, the
    // menu, multi-HIVE and confetti entirely.
    //
    // App news now comes from lib/appNews.ts, the living list the app already
    // shows every member on Home — sent by the caller, who is the owner, and
    // already public-facing by design.
    const appNews = Array.isArray(body.appNews)
      ? body.appNews.map((line) => String(line).trim()).filter(Boolean).slice(0, 12)
      : [];
    if (appNews.length > 0) {
      sections.push({ title: 'Around the HIVE (app updates)', lines: appNews });
    }

    // The expansion note — the same words the app shows on HIVE-Wide and at
    // sign-in, sent from lib/hiveWide.ts so the three can never drift apart.
    const expansionNote = Array.isArray(body.expansionNote)
      ? body.expansionNote.map((line) => String(line).trim()).filter(Boolean).slice(0, 8)
      : [];
    if (expansionNote.length > 0) {
      sections.push({
        title: 'Pardon our dust — we are expanding',
        lines: expansionNote,
      });
    }

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

    // Nobody has opted a wish into the letter yet, but six of them came true and
    // that IS the story — "the OG HIVErs are starting to reach critical mass"
    // (Nat 2026-08-03). So the total goes in even when no detail can.
    const grantedTotal = (grantedCountRows as { count?: number | null }).count ?? 0;
    if (grantedLines.length === 0 && grantedTotal > 0) {
      sections.push({
        title: 'Wishes granted 🌟',
        lines: [
          `${grantedTotal} ${grantedTotal === 1 ? 'wish' : 'wishes'} came true this month.`,
          'NOTE TO THE WRITER: say the number warmly and move on. No names, no'
          + ' hints, no "one member" descriptions — nobody chose to be in here yet.',
        ],
      });
    }

    // New threads worth telling people about — the boards move faster than
    // anyone checks them.
    const newThreads = posts
      .filter((row) => withinWindow(row.created_at))
      .filter((row) => row.visibility === 'public')
      .filter((row) => !/newsletter|compliment/i.test(row.title ?? ''))
      .slice(0, 8)
      .map((row) => (row.category?.name ? `${row.category.name} → ${row.title}` : String(row.title)));
    if (newThreads.length > 0) sections.push({ title: 'New on the boards', lines: newThreads });

    // No HDs, no POP, no "here's what Sara needs" — the newsletter is public
    // and those live on the members' side (Nat 2026-07-25). The meeting summary
    // is where that belongs; this is the face we show the world.

    // The letter is written FROM the outline, so the facts are identical — one
    // is for reading, the other for checking.
    const monthLabel = new Date(Date.UTC(
      Number(cycleStart.slice(0, 4)),
      Number(cycleStart.slice(5, 7)) - 1,
      15,
    )).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    // "The Buzz — July 2026 HIVE Recap", named for the month it recaps rather
    // than the month it goes out in. Nat renamed these on Wix for exactly this
    // reason: a letter titled for August that is all about July makes you feel
    // a month behind. The recap of July goes out in August, and says so.
    const recapTitle = `The Buzz — ${monthLabel} ${startYear} HIVE Recap`;
    const factsText = sections
      .map((section) => `${section.title}\n${section.lines.map((line) => `- ${line.trim()}`).join('\n')}`)
      .join('\n\n');
    const prose = body.includeProse === false ? null : await writeNewsletter(monthLabel, factsText, communityId);

    return jsonResponse({
      success: true,
      date,
      month: monthLabel,
      year: startYear,
      recap_title: recapTitle,
      prose,
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      sections,
      counts: {
        shout_outs: shoutOuts.length,
        compliments: compliments.length,
        helper_logs: helperLogs.length,
        granted: grantedLines.length,
      },
    });
  } catch (error) {
    console.error('draft-newsletter failed:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to draft the newsletter', 500);
  }
});

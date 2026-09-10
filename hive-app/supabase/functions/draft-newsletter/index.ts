import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { recordAssistantUsage } from '../_shared/metering.ts';

// The newsletter and the meeting summary are the SAME artifact pointed at
// different dates, so this returns the same `sections[]` shape seal-meeting
// produces and the app renders both with SummarySections. Nothing here is
// written twice. The facts here are deliberately limited to aggregate counts
// and owner-reviewed public editorial records. Member posts, wishes, profiles,
// roles, check-ins and HIVE associations never enter a public draft.
//
// Read-only by design. It drafts; Nat writes.

interface DraftRequest {
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
   * Writing the letter takes the better part of a minute; gathering takes about
   * a second. The screen asks for the facts first so there's something to read,
   * then asks again for the letter. Defaults true so any other caller still
   * gets the whole thing in one go.
   */
  includeProse?: boolean;
}

type EditorialLead = {
  source: "Nat's newsletter note" | 'End-of-month contribution';
  content: string;
};

function pacificToday() {
  return new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
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
  const suffix = hour >= 12 ? 'pm' : 'am';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === '00' ? `${twelve}${suffix}` : `${twelve}:${minute}${suffix}`;
}

function prettyTimeRange(start: string, end?: string | null) {
  const startText = prettyTime(start);
  if (!end) return startText;
  const endText = prettyTime(end);
  return startText.slice(-2) === endText.slice(-2)
    ? `${startText.slice(0, -2)}-${endText}`
    : `${startText}-${endText}`;
}

/**
 * HIVE Help rolls from one OG HIVE meeting to the next. The meetings fall
 * around the middle of the month, so the newsletter speaks in honest human
 * ranges ("mid-August to mid-September") rather than pretending the handoff
 * always happens on the 15th.
 *
 * The date boundary below is only the database lookup window for the two focus
 * cards. It must never become reader-facing copy.
 */
function hiveHelpCycle(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day >= 15 ? 15 : -16));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 15));
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 15));
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), previousStart: iso(previous) };
}

function midMonthSpan(start: string, end: string) {
  const monthName = (value: string) => new Date(`${value}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `mid-${monthName(start)} to mid-${monthName(end)}`;
}

/**
 * Every active worktop note is an editorial instruction for this issue. Survey
 * contributions seed the same letter after Nat's notes, and duplicate text is
 * kept out so a note never has to be starred to make the cut.
 */
function selectEditorialLeads(ownerNotes: string[], endOfMonthNotes: string[]): EditorialLead[] {
  const unique = (values: string[]) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const owner = unique(ownerNotes);
  const endOfMonth = unique(endOfMonthNotes);
  return [
    ...owner.map((content) => ({ source: "Nat's newsletter note" as const, content })),
    ...endOfMonth.map((content) => ({ source: 'End-of-month contribution' as const, content })),
  ];
}

/** The editor's one inline formatting marker is safe in plain text and email. */
function boldRequiredHeadings(prose: string): string {
  return prose.replace(/^\s*(?:\*\*)?(Upcoming events|HIVE Help)(?:\*\*)?\s*$/gim, '**$1**');
}

function prettyDateRange(start: string, end?: string | null) {
  if (!end || end === start) return prettyDate(start);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameMonth = startDate.getUTCFullYear() === endDate.getUTCFullYear()
    && startDate.getUTCMonth() === endDate.getUTCMonth();
  if (sameMonth) {
    const month = startDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    return `${month} ${startDate.getUTCDate()}–${endDate.getUTCDate()}`;
  }
  return `${prettyDate(start)}–${prettyDate(end)}`;
}

/** The newsletter receives only fully public events, with every entered detail. */
function upcomingEventLine(event: any) {
  const facts = [`${event.title} — ${prettyDateRange(event.event_date, event.end_date)}`];
  if (event.event_time) facts.push(prettyTimeRange(event.event_time, event.end_time));
  if (String(event.location ?? '').trim()) facts.push(`Where: ${String(event.location).trim()}`);
  if (String(event.description ?? '').trim()) facts.push(String(event.description).trim());
  const meetLink = String(event.meet_link ?? '').trim();
  if (meetLink && !String(event.description ?? '').includes(meetLink)) facts.push(`Link: ${meetLink}`);
  return facts.join(' · ');
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
    "You draft the HIVE's monthly newsletter for Nat, who runs a growing",
    'community network. She pastes your draft into Wix, tweaks it, and sends it. Write',
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
    'Neither of them gets a list of who did what. Write about what the collective',
    'is doing and becoming using aggregates and explicitly public invitations.',
    '',
    'THIS IS PUBLIC. Anyone can read it. Never name a member, connect a person to',
    'a HIVE, reveal a profile, role, ownership, wish, post, check-in, project or',
    'internal decision. One exception: a name supplied in an End-of-month',
    'contribution can appear in that contribution\'s voluntary shout-out or public',
    'event plug. Add no extra identifying context around it. If the facts are',
    'thin, write a shorter, warmer letter. Short and generous beats padded and cagey.',
    'Never mention Production HIVE or any work connected to it. Never state an',
    'exact number of HIVEs; say "multiple HIVEs" when the network itself matters.',
    '',
    'HER VOICE: warm, chatty, a little goofy. Short paragraphs. Exclamation',
    'points and em-dashes. Emoji sprinkled, never wall-to-wall. She says',
    '"Hivers", "the buzz", "keep the HIVE humming". She addresses everyone',
    'directly as "you". She celebrates collective momentum and submitted shout-outs.',
    '',
    'HER STRUCTURE — move from the human-sized story outward to the whole',
    'community. Use only headings that earn their place; this is a short letter,',
    'not a changelog or a pile of unrelated headers:',
    '  Yellow!                 (a sentence or two of hello; no boilerplate definition of HIVE)',
    '  People & connections    (welcomes and ways to find one another)',
    '  Wins worth buzzing about (granted wishes and voluntary shout-outs)',
    '  Around the HIVE         (only explicitly newsletter-ready public updates)',
    '  Keep the HIVE humming   (at most three useful invitations or nudges)',
    '  HIVE Help               (previous result, current focus, and how to help)',
    '  Upcoming events         (the final outward-looking block)',
    '',
    'HARD RULES:',
    '- Use ONLY the facts given. Never invent an event, a name, a date, or a',
    '  detail. If a section has no facts, leave it out entirely.',
    '- Never output a member name, profile detail, role, specific-HIVE membership,',
    '  ownership clue, private wish/post/check-in or internal project detail, except',
    '  for a voluntary name supplied inside an End-of-month contribution itself.',
    '- Never mention Production HIVE and never say there are three (or any exact',
    '  number of) HIVEs. The public wording is always "multiple HIVEs".',
    '- Every numbered Newsletter beat is editorial material. Carry the substance',
    '  of every Nat newsletter note into the letter once, in the section where it',
    '  belongs. Merge related notes into a lively passage when useful, but never',
    '  omit a Nat note or turn it into a vague generic update. Nat\'s notes are',
    '  not quotes or attribution. End-of-month contributions are express invitations',
    '  for a shout-out or plug when their submitted words make that safe.',
    '- Never ask readers to RSVP, coordinate with Nat, or join a group plan for',
    '  a public hang. Say HIVE members will be there and readers are welcome to join.',
    '- Never say check-ins were broken, lost, fixed, or only now reach Nat. If a',
    '  check-in nudge is useful, simply invite members to check in before their',
    '  meeting. End-of-month contributions are editorial material, not a reader ask.',
    '- Never explain HIVE-Wide, Admin, privacy settings, or other inside-the-app',
    '  mechanics unless an explicit newsletter-ready fact makes them necessary.',
    '- Where you need something only Nat knows, write it as a bracket, e.g.',
    '  [add anything I missed] — do not guess.',
    '- Write the HIVE Help section as one story: celebrate the previous cycle\'s',
    '  result first, then name the current focus and its mid-month-to-mid-month',
    '  range. Keep every shelter, mascot, costume, current-focus and logging',
    '  sentence inside this one section. Never begin another section with HIVE',
    '  Help material and never return to it under Keep the HIVE humming.',
    '- Write affirmatively. Lead with what readers can enjoy, do, or celebrate.',
    '  Do not use negative framing such as "no pressure" or "no wrong time to',
    '  start", and do not use cushioning qualifiers such as "small", "tiny",',
    '  "calm", "low effort", or "no shame" unless a supplied fact makes one',
    '  indispensable.',
    '- Keep the reader-facing highlights skimmable by combining related notes',
    '  into the same section. Skimmability never permits dropping a Nat note.',
    '- When there are Upcoming events facts, use a **Upcoming events** heading and',
    '  give every event its own useful line. This is one sealed event block:',
    '  mention every supplied event exactly once here and nowhere else in the',
    '  letter, including Keep the HIVE humming. Carry through the exact date, time,',
    '  place, description, ticket details, price and link supplied in the facts.',
    '  If a ticket link or price was not supplied, do not invent one.',
    '- Upcoming events is the final content section. HIVE Help sits immediately',
    '  before it when both exist. End after the events with the sign-off; do not',
    '  return to app updates, wins, HIVE Help, or reminders afterward.',
    '- When the facts include new-member connection guidance, welcome the new',
    '  members and carry every practical way to connect with them. Never reduce',
    '  that guidance to only the number of people who joined.',
    '- The HIVE knows every HD Wish and works on them together. When only an',
    '  aggregate is public, celebrate how many HD Wishes were granted and do not',
    '  claim that the HIVE does not know their stories. Do not describe a wish.',
    '- Use **bold markdown markers** around every heading, including Upcoming events',
    '  and HIVE Help, and nowhere else. Headings sit on their own line.',
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
    const drafted = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    return drafted ? boldRequiredHeadings(drafted) : null;
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

    // The Buzz is a HIVE-Wide artifact. It takes facts only from HIVEs that
    // explicitly permit public sharing; it never inherits the last selected
    // HIVE from the writer's browser.
    const { data: publicHives } = await supabaseAdmin
      .from('communities')
      .select('id')
      .eq('max_share_scope', 'public')
      .eq('publicly_listed', true);
    const publicHiveIds = ((publicHives ?? []) as { id: string }[]).map((hive) => hive.id);
    if (publicHiveIds.length === 0) {
      return jsonResponse({
        success: true,
        blocked: true,
        month: null,
        prose: null,
        sections: [],
        reason: 'There are no HIVE spaces set up to share public newsletter material yet.',
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
    const newsletterMonthStart = `${thisYear}-${String(thisMonth).padStart(2, '0')}-01`;
    const newsletterMonthEnd = new Date(Date.UTC(thisYear, thisMonth, 1)).toISOString().slice(0, 10);
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

    const [
      upcomingRows,
      grantedCountRows,
      newMemberCountRows,
      pastEventRows,
      thoughtRows,
      responseRows,
      helperFocusRows,
      lastLiveSendRows,
    ] = await Promise.all([
      // The newsletter is public, so its calendar is narrower than the signed-in
      // HIVE-Wide Home calendar. A September issue names every PUBLIC September
      // event and no members-only/HIVE-Wide event. Both visibility fields must
      // agree; an old half-migrated row stays private. `publicHiveIds` is another
      // guard against a private HIVE leaking through a malformed event record.
      supabaseAdmin.from('events')
        .select('title, event_date, end_date, event_time, end_time, event_type, location, description, meet_link, visibility, invited_scope, community:communities(name)')
        .in('community_id', publicHiveIds)
        .eq('visibility', 'public').eq('invited_scope', 'public')
        .gte('event_date', newsletterMonthStart)
        .lt('event_date', newsletterMonthEnd)
        .order('event_date', { ascending: true }).order('event_time', { ascending: true }),
      // Counted, never named — how many wishes came true is a fact about the
      // HIVE, not about anybody in it.
      supabaseAdmin.from('wishes')
        .select('id', { count: 'exact', head: true })
        .in('community_id', publicHiveIds)
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', startIso)
        .is('deleted_at', null),
      // Aggregate growth is safe public evidence; no roster or identity crosses.
      supabaseAdmin.from('community_memberships')
        .select('id', { count: 'exact', head: true })
        .in('community_id', publicHiveIds)
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      // Hangs that already HAPPENED. Nat's newsletter reports on the month as
      // much as it looks ahead ("Hivers were showing up for each other all
      // over!"), and a draft with only upcoming events can't write that.
      supabaseAdmin.from('events')
        .select('title, event_date, event_type, description, location')
        .in('community_id', publicHiveIds)
        .eq('visibility', 'public').eq('invited_scope', 'public')
        .gte('event_date', cycleStart).lt('event_date', cycleEnd)
        .order('event_date', { ascending: true }).limit(30),
      // Owner notes are editorial leads. They are never exposed outside this
      // owner-only drafting call.
      supabaseAdmin.from('newsletter_thoughts')
        .select('content, created_at')
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      // These answers expressly ask for newsletter consideration. Keep their
      // authors out of the data so the writer cannot accidentally identify one.
      supabaseAdmin.from('survey_responses')
        .select('answers, submitted_at, created_at, survey:surveys!survey_id(title)')
        .order('created_at', { ascending: false }).limit(160),
      // A HIVE Help title is the shared focus, not somebody's contribution.
      // Read only that title and its date; never pull the private board body.
      supabaseAdmin.from('board_posts')
        .select('title, created_at, category:board_categories!inner(topic_kind)')
        .in('community_id', publicHiveIds)
        .eq('category.topic_kind', 'helper_log')
        .is('archived_at', null)
        .order('created_at', { ascending: false }).limit(24),
      // Once a live issue has gone, the next issue starts with a fresh
      // worktop. Keep the original survey receipt, but do not recycle it.
      supabaseAdmin.from('newsletter_sends')
        .select('created_at')
        .eq('mode', 'live')
        .order('created_at', { ascending: false }).limit(1),
    ]);

    // Meetings and birthdays are never newsletter filler. The travel exclusion
    // is defence in depth for stale rows while the database migration lands.
    const upcoming = (upcomingRows.data ?? []) as any[];
    const upcomingEvents = upcoming.filter((event) => (
      event.event_type !== 'meeting'
      && event.event_type !== 'birthday'
      && !/\b(out of town|away|trip|travel|galavant)/i.test(event.title ?? '')
    ));
    const { start: helpStart, end: helpEnd, previousStart: previousHelpStart } = hiveHelpCycle(date);
    const helperPosts = ((helperFocusRows.data ?? []) as any[]).filter((row) => (
      row.category?.topic_kind === 'helper_log'
      && !/ideas/i.test(row.title ?? '')
      && /HIVE Help(?:ers)?\s*[—–-]+/i.test(row.title ?? '')
    ));
    const focusText = (row: any) => String(row.title).replace(/^.*HIVE Help(?:ers)?\s*[—–-]+\s*/i, '').trim();
    const currentHelp = helperPosts.find((row) => row.created_at >= `${helpStart}T00:00:00Z` && row.created_at < `${helpEnd}T00:00:00Z`);
    const previousHelp = helperPosts.find((row) => row.created_at >= `${previousHelpStart}T00:00:00Z` && row.created_at < `${helpStart}T00:00:00Z`);
    const ownerNotes = ((thoughtRows.data ?? []) as any[])
      .map((row) => String(row.content ?? '').trim()).filter(Boolean);
    const newsletterAnswerIds = ['q_eom_newsletter', 'q_newsletter', 'q_shoutout'];
    const lastLiveNewsletterAt = String(((lastLiveSendRows.data ?? []) as any[])[0]?.created_at ?? '');
    const newsletterInputStart = lastLiveNewsletterAt > startIso ? lastLiveNewsletterAt : startIso;
    const endOfMonthNotes = ((responseRows.data ?? []) as any[])
      .filter((row) => String(row.submitted_at ?? row.created_at ?? '') >= newsletterInputStart)
      .filter((row) => {
        const survey = Array.isArray(row.survey) ? row.survey[0] : row.survey;
        return String(survey?.title ?? '').trim().toLocaleLowerCase() === 'end of the month';
      })
      .flatMap((row) => newsletterAnswerIds.map((id) => String(row.answers?.[id] ?? '').trim()))
      .filter(Boolean);
    const editorialLeads = selectEditorialLeads(ownerNotes, endOfMonthNotes);

    const sections: { title: string; lines: string[] }[] = [];

    if (upcomingEvents.length > 0) {
      sections.push({
        title: 'Upcoming events',
        lines: upcomingEvents.map(upcomingEventLine),
      });
    }

    if (previousHelp || currentHelp) {
      const lines: string[] = [];
      if (previousHelp) lines.push(`Previous HIVE Help (${midMonthSpan(previousHelpStart, helpStart)}): ${focusText(previousHelp)}`);
      if (currentHelp) lines.push(`Current HIVE Help (${midMonthSpan(helpStart, helpEnd)}): ${focusText(currentHelp)}`);
      sections.push({ title: 'HIVE Help cycle', lines });
    }

    if (editorialLeads.length > 0) {
      sections.push({
        title: 'Newsletter beats — include each one once',
        lines: editorialLeads.map((lead, index) => `${index + 1}. ${lead.source}: ${lead.content}`),
      });
    }

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
      ? body.appNews
        .map((line) => String(line).trim())
        .filter(Boolean)
        .filter((line) => !/\bproduction(?:\s+hive)?\b/i.test(line))
        .filter((line) => !/\b(?:three|3)\s+hives?\b/i.test(line))
        .slice(0, 5)
      : [];
    if (appNews.length > 0) {
      sections.push({ title: 'Around the HIVE (app updates)', lines: appNews });
    }

    // Aggregate growth is deliberately safe: it says the collective grew and
    // never who joined, which HIVE they joined, or anything from their profile.
    const newMemberTotal = (newMemberCountRows as { count?: number | null }).count ?? 0;
    if (newMemberTotal > 0) {
      sections.push({
        title: 'The HIVE is growing',
        lines: [
          `We welcomed ${newMemberTotal} new ${newMemberTotal === 1 ? 'member' : 'members'} this month.`,
          'If a newsletter beat supplies ways to connect with new members, carry all of that guidance here; the count is not a substitute for the note.',
        ],
      });
    }

    // A count may celebrate momentum. The wish and the person stay inside the
    // signed-in app regardless of their HIVE-Wide reach.
    const grantedTotal = (grantedCountRows as { count?: number | null }).count ?? 0;
    if (grantedTotal > 0) {
      sections.push({
        title: 'Wishes granted 🌟',
        lines: [
          `${grantedTotal} HD ${grantedTotal === 1 ? 'Wish was' : 'Wishes were'} granted this month.`,
          'The HIVE knows every HD Wish and works on them together. These wishes were not public, so celebrate the total without describing a wish or naming anyone.',
        ],
      });
    }

    // No general board-feed scrape. A public row is not automatically a
    // newsletter pitch; selected app news and owner-reviewed notes are.

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
    const prose = body.includeProse === false ? null : await writeNewsletter(monthLabel, factsText, publicHiveIds[0]);
    // Facts are useful even if the writing provider is temporarily unavailable,
    // but the caller needs to know the difference. Previously a null prose
    // response looked like a completed draft and stranded Nat on this page.
    const writingError = body.includeProse === false || prose
      ? null
      : 'The letter writer did not return a draft. Your facts are still here — try rebuilding the draft.';

    return jsonResponse({
      success: true,
      date,
      month: monthLabel,
      year: startYear,
      recap_title: recapTitle,
      prose,
      writing_error: writingError,
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      sections,
      counts: {
        new_members: newMemberTotal,
        granted: grantedTotal,
      },
    });
  } catch (error) {
    console.error('draft-newsletter failed:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to draft the newsletter', 500);
  }
});

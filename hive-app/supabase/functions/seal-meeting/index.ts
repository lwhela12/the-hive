import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { recordAssistantUsage } from '../_shared/metering.ts';
import {
  MONTHLY_CHECK_IN_PATTERN,
  PRE_MEETING_CHECK_IN_PATTERN,
} from '../_shared/checkInPatterns.ts';

// "The meeting notes write themselves": compose everything that happened in
// the app on meeting day (events penciled in, to-dos fanned out, wish notes,
// and wishes granted) into a real meeting record on the Meetings
// tab. The Helper remains the operating record; when a transcript exists it is
// reconciled as supporting evidence rather than ignored or treated as the
// outline. Called from Wrap-Up, or with the service key (daily cron auto-seal).

interface SealMeetingRequest {
  communityId: string;
  /** Local meeting date (YYYY-MM-DD). Defaults to today in Pacific time. */
  date?: string;
  /** Re-read the surviving ledger for an existing meeting. Admin-only. */
  mode?: 'seal' | 'rebuild';
  meetingId?: string;
  /** Explicit Wrap-Up roll call. Never inferred from q_attendance. */
  confirmed_absentee_ids?: string[];
}

type SummarySection = {
  title: string;
  lines?: string[];
  intro?: string;
  groups?: {
    title: string;
    lines: string[];
    meta?: string;
    review?: {
      kind: 'action_item_owner' | 'record_correction';
      conflict_id: string;
      action_item_id?: string;
      task_description?: string;
      current_owner_id?: string;
      current_owner_name?: string;
      summary_line?: string;
    };
  }[];
  tone?: 'default' | 'warm' | 'warning';
  /** Stored audit provenance; the reader keeps this out of the recap itself. */
  source_label: string;
};

type TranscriptReconciliation = {
  overview: string;
  attendance: {
    in_person: string[];
    remote: string[];
    absent: string[];
    unclear: string[];
  };
  decisions: { section: 'treasurer' | 'meetups' | 'hummdinger' | 'wrapup'; text: string }[];
  member_context: { person: string; context: string }[];
  duty_labels: { task: string; label: string }[];
  conflicts: { topic: string; helper_record: string; transcript_evidence: string; action_item_id?: string }[];
};

type MeetingHelperSnapshot = {
  captured_at: string;
  notes: Record<string, string>;
  roster: { id: string; name: string }[];
  check_ins: { user_id: string; name: string; attendance: string; answers: Record<string, unknown> }[];
  confirmed_absentee_ids: string[];
  confirmed_absentee_names: string[];
  honey_pot_balance: number;
  next_meeting: Record<string, unknown> | null;
  upcoming_hangs: Record<string, unknown>[];
  help_focus: string | null;
};

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

function surveyDueDateMatchesMeeting(dueDate: string | null | undefined, meetingDate: string) {
  if (!dueDate) return false;
  const dueAt = Date.parse(dueDate);
  if (Number.isNaN(dueAt)) return false;
  // Survey due dates have historically used both midnight UTC and the
  // following midnight UTC to mean the Pacific meeting evening. Accept the
  // stored UTC date and the local-day interpretation, but no other cycle.
  return new Date(dueAt).toISOString().slice(0, 10) === meetingDate
    || new Date(dueAt - 12 * 3600_000).toISOString().slice(0, 10) === meetingDate;
}

// Same routing-token stripping as lib/actionItemDisplay.ts on the client.
function cleanJotText(description: string) {
  let text = description.trim();
  // Meeting Helper fan-outs have used both "@meg @izzy do this" and
  // "and @meg and @izzy do this". Those tokens decide who receives the row;
  // they are not part of the task people should read afterward.
  const mentionMatch = text.match(/^((?:(?:and\s+)?@[\w.-]+(?:[,\s]+|$))+)/i);
  if (mentionMatch) text = text.slice(mentionMatch[0].length).trim();
  const reMatch = text.match(/\s*\(re:\s*([^)]+)\)$/i);
  if (reMatch) text = text.slice(0, text.length - reMatch[0].length).trim();
  // A routing token is not a task. Old Meeting Helper capture could save
  // rows shaped only like "@og (re: Meghan)" or "and @meg and @izzy".
  // They remain in the audit trail, but must never be presented as work the
  // room agreed to do.
  const meaningful = text
    .replace(/@[\w.-]+/g, ' ')
    .replace(/\b(?:and|connect|about|with|to|re)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
  return meaningful ? text : '';
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
    'You condense HIVE members\' check-in answers into one line each for a',
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

function parseModelJson(text: string) {
  const raw = text.trim()
    .replace(/^```json\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .replace(/^```\s*\n?/, '')
    .replace(/\n?```\s*$/, '');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Daily can hand us the same room recording more than once. August contained
 * three near-identical passes: feeding all three to the model makes repetition
 * look like emphasis and can mint false decisions. The original transcript is
 * never changed; this evidence copy keeps the first occurrence of each exact
 * utterance and reports the reduction in provenance.
 */
function transcriptEvidenceCopy(transcript: string) {
  const original = transcript.split('\n').map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  const kept = original.filter((line) => {
    const key = line.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    text: kept.join('\n').slice(0, 150_000),
    originalLineCount: original.length,
    evidenceLineCount: kept.length,
    truncated: kept.join('\n').length > 150_000,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim()).map((entry) => entry.trim())
    : [];
}

async function reconcileTranscript(
  transcript: string,
  snapshot: MeetingHelperSnapshot,
  duties: { task: string; owners: string[]; about: string | null; status: string; action_item_ids: string[] }[],
  communityId: string,
): Promise<{ result: TranscriptReconciliation; evidence: ReturnType<typeof transcriptEvidenceCopy> }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('The transcript is present, but transcript reconciliation is not configured.');

  const evidence = transcriptEvidenceCopy(transcript);
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    output_config: { effort: 'medium' as const },
    system: [
      'You reconcile a HIVE meeting record. The Meeting Helper snapshot is the authoritative operating record.',
      'Its authored notes, pre-meeting inputs, final absentee selection, flow, and the supplied current duty ledger outrank the transcript.',
      'The transcript is supporting evidence for what was said, final wording, context, and discrepancies. It may contain transcription errors, shared-microphone misattribution, and duplicated recording passes.',
      'Never create or reassign a duty. Owners come only from CURRENT_DUTIES. Never turn discussion into a final decision unless the transcript clearly closes it.',
      'A spoken promise that is missing from CURRENT_DUTIES is a conflict to review, not a confirmed responsibility and not decision wording.',
      'For dates, event titles, attendance intentions, and money balances, copy the Meeting Helper snapshot exactly. The transcript may explain why, but it must not rename or replace a saved calendar item.',
      'If confirmed_absentee_names is non-empty, never say everyone or all members attended. Missing pre-meeting input is not itself a conflict.',
      'If sources disagree, put the discrepancy in conflicts. Do not guess. Use first names from the roster exactly.',
      'Return only valid JSON with this shape:',
      '{"overview":"2-4 humane sentences","attendance":{"in_person":[],"remote":[],"absent":[],"unclear":[]},"decisions":[{"section":"treasurer|meetups|hummdinger|wrapup","text":"..."}],"member_context":[{"person":"First","context":"1-2 concise sentences"}],"duty_labels":[{"task":"exact CURRENT_DUTIES task","label":"humane concise wording"}],"conflicts":[{"topic":"...","helper_record":"...","transcript_evidence":"...","action_item_id":"exact id when this conflict concerns a current duty, otherwise empty"}]}',
      'Attendance rule: confirmed absentees are absent. Pre-meeting attendance is an intention; use explicit transcript statements to resolve remote vs in-person, and leave unclear when unsupported.',
      'Member context should summarize what each person brought or needed, not repeat their assigned duties.',
      'For every CURRENT_DUTIES task, return one duty_labels row. The task key must be exact. The label may repair shorthand into humane English but must preserve the same obligation, specificity, and tone; it must not change owners.',
    ].join('\n'),
    messages: [{
      role: 'user',
      content: [
        `MEETING_HELPER_SNAPSHOT\n${JSON.stringify(snapshot)}`,
        `CURRENT_DUTIES\n${JSON.stringify(duties)}`,
        `TRANSCRIPT_EVIDENCE (${evidence.evidenceLineCount} unique lines from ${evidence.originalLineCount}; original preserved)\n${evidence.text}`,
      ].join('\n\n'),
    }],
  });
  recordAssistantUsage({ functionName: 'seal-meeting', model: 'claude-sonnet-5', usage: response.usage, communityId });
  if ((response as { stop_reason?: string }).stop_reason === 'refusal') {
    throw new Error('The transcript reconciliation was refused; the existing summary was preserved.');
  }
  const text = response.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const parsed = parseModelJson(text);
  const attendance = (parsed.attendance && typeof parsed.attendance === 'object')
    ? parsed.attendance as Record<string, unknown>
    : {};
  const allowedNames = new Set(snapshot.roster.map((person) => firstName(person.name)));
  const keepNames = (value: unknown) => stringArray(value).filter((name) => allowedNames.has(firstName(name))).map(firstName);
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const memberContext = Array.isArray(parsed.member_context) ? parsed.member_context : [];
  const dutyLabels = Array.isArray(parsed.duty_labels) ? parsed.duty_labels : [];
  const conflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
  const exactTasks = new Set(duties.map((duty) => duty.task));
  const exactActionItemIds = new Set(duties.flatMap((duty) => duty.action_item_ids));
  return {
    evidence,
    result: {
      overview: typeof parsed.overview === 'string' ? parsed.overview.trim() : '',
      attendance: {
        in_person: keepNames(attendance.in_person),
        remote: keepNames(attendance.remote),
        absent: [...new Set([...keepNames(attendance.absent), ...snapshot.confirmed_absentee_names.map(firstName)])],
        unclear: keepNames(attendance.unclear),
      },
      decisions: decisions.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const section = row.section;
        const decision = typeof row.text === 'string' ? row.text.trim() : '';
        return decision && ['treasurer', 'meetups', 'hummdinger', 'wrapup'].includes(String(section))
          ? [{ section: section as TranscriptReconciliation['decisions'][number]['section'], text: decision }]
          : [];
      }),
      member_context: memberContext.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const person = typeof row.person === 'string' ? firstName(row.person) : '';
        const context = typeof row.context === 'string' ? row.context.trim() : '';
        return allowedNames.has(person) && context ? [{ person, context }] : [];
      }),
      duty_labels: dutyLabels.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const task = typeof row.task === 'string' ? row.task : '';
        const label = typeof row.label === 'string' ? row.label.trim() : '';
        return exactTasks.has(task) && label ? [{ task, label }] : [];
      }),
      conflicts: conflicts.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const topic = typeof row.topic === 'string' ? row.topic.trim() : '';
        const helper = typeof row.helper_record === 'string' ? row.helper_record.trim() : '';
        const transcriptLine = typeof row.transcript_evidence === 'string' ? row.transcript_evidence.trim() : '';
        const actionItemId = typeof row.action_item_id === 'string' && exactActionItemIds.has(row.action_item_id)
          ? row.action_item_id
          : undefined;
        return topic && (helper || transcriptLine)
          ? [{ topic, helper_record: helper, transcript_evidence: transcriptLine, action_item_id: actionItemId }]
          : [];
      }),
    },
  };
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
    const isRebuild = body.mode === 'rebuild';
    if (isRebuild && !body.date) return errorResponse('A rebuild needs the meeting date.', 400);
    let confirmedAbsenteeIds = Array.isArray(body.confirmed_absentee_ids)
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
    let mayRebuild = authHeader === `Bearer ${serviceKey}`;
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
      mayRebuild = mayConfirmAbsence;
    }
    if (isRebuild && !mayRebuild) {
      return errorResponse('Only a HIVE admin can rebuild a meeting summary.', 403);
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

    // One meeting record per date. Read it before the ledger so a rebuild can
    // also include tasks that were explicitly linked after meeting day.
    const { data: existingRows } = await supabaseAdmin
      .from('meetings')
      .select('id, summary, transcript_raw')
      .eq('community_id', communityId)
      .eq('date', date)
      .order('created_at', { ascending: true });
    const existing = (existingRows ?? []).find((row) => row.transcript_raw) ?? (existingRows ?? [])[0] ?? null;
    if (isRebuild && !existing) return errorResponse('Meeting not found.', 404);
    if (body.meetingId && existing?.id !== body.meetingId) {
      return errorResponse('That meeting does not match this HIVE and date.', 409);
    }
    let previous: Record<string, unknown> = {};
    if (existing?.summary) {
      try { previous = JSON.parse(existing.summary); } catch { previous = {}; }
    }

    // The Wrap-Up selection was already preserved for August in the held recap
    // notification, but the old summary writer failed to copy it onto the
    // meeting. A rebuild recovers that operating record before composing.
    if (isRebuild && confirmedAbsenteeIds.length === 0 && existing) {
      const previousSnapshot = previous.meeting_helper_snapshot as MeetingHelperSnapshot | undefined;
      if (Array.isArray(previousSnapshot?.confirmed_absentee_ids)) {
        confirmedAbsenteeIds = previousSnapshot.confirmed_absentee_ids;
      } else {
        const { data: heldRecaps } = await supabaseAdmin
          .from('notifications')
          .select('metadata')
          .eq('metadata->>post_meeting_recap_meeting_id', existing.id)
          .order('created_at', { ascending: false })
          .limit(1);
        const heldIds = (heldRecaps?.[0]?.metadata as { post_meeting_recap_absentee_ids?: unknown } | undefined)
          ?.post_meeting_recap_absentee_ids;
        if (Array.isArray(heldIds)) {
          confirmedAbsenteeIds = heldIds.filter((id): id is string => typeof id === 'string' && !!id);
        }
      }
    }

    const [eventsRes, todosRes, notesRes, grantedRes] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('title, event_date')
        .eq('community_id', communityId)
        .gte('created_at', startIso).lt('created_at', endIso),
      supabaseAdmin
        // Retired to-dos stay out of the record. A jot that was archived the
        // same night was archived FOR a reason — a duplicate, or a HIVE Help
        // focus that got replaced — and a summary that lists it is telling
        // people to go and do something nobody is asking them to do.
        .from('action_items')
        .select('id, description, assigned_to, completed, meeting_id, assignee:profiles!assigned_to(name), about:profiles!related_user_id(name)')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .gte('created_at', startIso).lt('created_at', endIso),
      supabaseAdmin
        .from('wish_comments')
        .select('content, wish:wishes!wish_id(title, description, user:profiles!user_id(name))')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .like('content', '📝 From the%')
        .gte('created_at', startIso).lt('created_at', endIso),
      supabaseAdmin
        .from('wishes')
        .select('title, description, user:profiles!user_id(name), granters:wish_granters(granter:profiles!granter_id(name))')
        .eq('community_id', communityId)
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', startIso).lt('fulfilled_at', endIso)
        .is('deleted_at', null),
    ]);

    const linkedTodosRes = existing
      ? await supabaseAdmin
        .from('action_items')
        .select('id, description, assigned_to, completed, meeting_id, assignee:profiles!assigned_to(name), about:profiles!related_user_id(name)')
        .eq('community_id', communityId)
        .eq('meeting_id', existing.id)
        .is('archived_at', null)
      : { data: [] as unknown[] };

    const events = (eventsRes.data ?? []) as { title: string; event_date: string }[];
    const todoRows = [...(todosRes.data ?? []), ...(linkedTodosRes.data ?? [])] as {
      id: string;
      description: string;
      assigned_to: string | null;
      completed: boolean | null;
      meeting_id: string | null;
      assignee?: { name?: string } | null;
      about?: { name?: string } | null;
    }[];
    const todos = Array.from(new Map(todoRows.map((todo) => [todo.id, todo])).values());
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
    // The check-ins are the other half of the meeting: what people said they're
    // working on, stuck on, and focused on. They're what makes a recap readable
    // to someone who wasn't there, rather than a list of clicks.
    const [notesRow, ledgerRows, memberRows, wishRows] = await Promise.all([
      supabaseAdmin.from('communities').select('meeting_helper_notes, name, honey_pot_enabled').eq('id', communityId).maybeSingle(),
      supabaseAdmin.from('honey_pot_transactions').select('amount').eq('community_id', communityId),
      supabaseAdmin.from('community_memberships').select('user:profiles!user_id(id, name)').eq('community_id', communityId),
      supabaseAdmin.from('wishes')
        .select('title, description, user_id, is_spotlight, created_at')
        .eq('community_id', communityId).eq('status', 'public')
        .is('deleted_at', null)
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
    const roster = ((memberRows.data ?? []) as any[])
      .flatMap((row) => row.user?.id && row.user?.name ? [{ id: row.user.id as string, name: row.user.name as string }] : []);
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
        // The address comes along. "Next HIVE meeting: Thursday, September 10"
        // does not tell somebody catching up where to go, and Production moved
        // to Charlee's house at the meeting that line is summarising.
        .select('title, event_date, event_time, location')
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
      .select('answers, submitted_at, response_period, user_id, user:profiles!user_id(name), survey:surveys!survey_id(title, due_date)')
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
    const responsePeriod = date.slice(0, 7);
    const checkIns = ((checkInRows ?? []) as any[])
      .filter((row) => {
        const surveyTitle = row.survey?.title ?? '';
        if (MONTHLY_CHECK_IN_PATTERN.test(surveyTitle)) {
          return row.response_period === responsePeriod;
        }
        if (PRE_MEETING_CHECK_IN_PATTERN.test(surveyTitle)) {
          return surveyDueDateMatchesMeeting(row.survey?.due_date, date);
        }
        return false;
      })
      .map((row) => ({
        userId: row.user_id as string,
        name: row.user?.name ? firstName(row.user.name) : 'Someone',
        answers: (row.answers ?? {}) as Record<string, unknown>,
        attendance: typeof row.answers?.q_attendance === 'string' ? row.answers.q_attendance.trim() : '',
        submittedAt: row.submitted_at as string,
      }))
      // The query is newest-first. If an old duplicate survey row exists for
      // the same cycle, keep the latest current-cycle answer for that member.
      .filter((entry, index, entries) => (
        entries.findIndex((candidate) => candidate.userId === entry.userId) === index
      ));

    // Fan-outs create one row per member for the same jot — group by clean text.
    // Routing-only placeholders are retained in action_items for audit/undo,
    // but they are not meeting outcomes.
    const keptTodos = todos.filter((todo) => !!cleanJotText(todo.description));
    const todoGroups = new Map<string, {
      ids: string[];
      ownerIds: string[];
      names: string[];
      about: string | null;
      open: number;
      completed: number;
    }>();
    keptTodos.forEach((todo) => {
      const text = cleanJotText(todo.description);
      const group = todoGroups.get(text) ?? {
        ids: [],
        ownerIds: [],
        names: [],
        about: todo.about?.name ? firstName(todo.about.name) : null,
        open: 0,
        completed: 0,
      };
      if (!group.ids.includes(todo.id)) group.ids.push(todo.id);
      if (todo.assigned_to && !group.ownerIds.includes(todo.assigned_to)) group.ownerIds.push(todo.assigned_to);
      const name = todo.assignee?.name ? firstName(todo.assignee.name) : null;
      if (name && !group.names.includes(name)) group.names.push(name);
      if (todo.completed) group.completed += 1;
      else group.open += 1;
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

    /**
     * "Nothing happened" has to mean nothing was KEPT — not nothing was
     * clicked.
     *
     * `details` is app activity: an event penciled in, a to-do handed out, a
     * note on a wish. A meeting can have none of that and
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
    const todoPeople = new Set(keptTodos.map((todo) => todo.assigned_to).filter(Boolean)).size;
    // The tally is a sentence about what was CLICKED, so a night whose whole
    // record is a recording gets no tally rather than a full stop on its own.
    const tally = [
      events.length ? `${events.length} event${events.length === 1 ? '' : 's'} penciled in` : null,
      todoGroups.size ? `${todoGroups.size} to-do${todoGroups.size === 1 ? '' : 's'} handed out across ${todoPeople} list${todoPeople === 1 ? '' : 's'}` : null,
      notes.length ? `${notes.length} wish note${notes.length === 1 ? '' : 's'}` : null,
      granted.length ? `${granted.length} wish${granted.length === 1 ? '' : 'es'} granted` : null,
    ].filter(Boolean).join(' · ');
    const priorRebuildHistory = Array.isArray(previous.rebuild_history)
      ? previous.rebuild_history as unknown[]
      : [];
    // Keep one non-recursive snapshot of the version this rebuild replaces.
    // That snapshot includes any human correction, while the newly rebuilt
    // record becomes the visible version again.
    const {
      rebuild_history: _oldRebuildHistory,
      manual_correction: _oldManualCorrection,
      manual_correction_history: _oldManualCorrectionHistory,
      ...previousGeneratedFields
    } = previous;
    const previousWithoutNestedHistory = Object.fromEntries(
      Object.entries(previous).filter(([key]) => key !== 'rebuild_history')
    );
    const rebuiltAt = new Date().toISOString();
    const rebuildHistory = isRebuild
      ? [
        ...priorRebuildHistory,
        {
          replaced_at: rebuiltAt,
          replaced_by: sealedBy,
          summary: previousWithoutNestedHistory,
        },
      ].slice(-5)
      : priorRebuildHistory;

    // THE SUMMARY IS THE HELPER, PRESERVED. The previous implementation said
    // that in a comment, then sorted the task ledger to the top and flattened
    // every slide into identical bullets. Capture the operating record once and
    // keep its running order: Roll Call, News, Treasurer, Meet-Ups,
    // HummDingers, Wrap-Up.
    const answerOf = (answers: Record<string, unknown>, key: string) => {
      const value = answers[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const bulletsFrom = (text?: string) => (text ?? '')
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*]+/, '').trim())
      .filter(Boolean);

    const confirmedAbsenteeNames = confirmedAbsenteeIds
      .map((id) => roster.find((person) => person.id === id)?.name)
      .filter((name): name is string => !!name);
    const currentSnapshot: MeetingHelperSnapshot = {
      captured_at: rebuiltAt,
      notes: deckNotes,
      roster,
      check_ins: checkIns.map((entry) => ({
        user_id: entry.userId,
        name: entry.name,
        attendance: entry.attendance,
        answers: entry.answers,
      })),
      confirmed_absentee_ids: confirmedAbsenteeIds,
      confirmed_absentee_names: confirmedAbsenteeNames,
      honey_pot_balance: potBalance,
      next_meeting: nextMeeting,
      upcoming_hangs: upcomingHangs,
      help_focus: helpFocus,
    };
    const priorSnapshot = previous.meeting_helper_snapshot as MeetingHelperSnapshot | undefined;
    const helperSnapshot = isRebuild && priorSnapshot?.captured_at ? priorSnapshot : currentSnapshot;
    const helperNotes = helperSnapshot.notes ?? {};

    const dutyRows = Array.from(todoGroups, ([task, group]) => ({
      task,
      owners: group.names,
      owner_ids: group.ownerIds,
      about: group.about,
      action_item_ids: group.ids,
      status: group.open === 0 && group.completed > 0
        ? 'complete'
        : group.completed > 0
          ? `${group.completed} complete, ${group.open} open`
          : 'open',
    }));
    const transcript = (existing?.transcript_raw ?? '').trim();
    const reconciled = transcript
      ? await reconcileTranscript(transcript, helperSnapshot, dutyRows, communityId)
      : null;
    const transcriptResult = reconciled?.result ?? null;
    const resolvedConflictIds = new Set(
      (Array.isArray(previous.conflict_resolutions) ? previous.conflict_resolutions : [])
        .flatMap((entry) => (
          entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).conflict_id === 'string'
            ? [(entry as Record<string, string>).conflict_id]
            : []
        )),
    );
    const unresolvedConflicts = (transcriptResult?.conflicts ?? []).flatMap((conflict) => {
      const topicSlug = conflict.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
      const conflictId = conflict.action_item_id
        ? `action-item-owner:${conflict.action_item_id}`
        : `source-record:${topicSlug || 'discrepancy'}`;
      return resolvedConflictIds.has(conflictId) ? [] : [{ ...conflict, conflictId }];
    });

    const sections: SummarySection[] = [];
    const rosterFirstNames = helperSnapshot.roster.map((person) => firstName(person.name));
    const absentNames = new Set([
      ...(transcriptResult?.attendance.absent ?? []),
      ...helperSnapshot.confirmed_absentee_names.map(firstName),
    ]);
    const remoteNames = new Set((transcriptResult?.attendance.remote ?? []).filter((name) => !absentNames.has(name)));
    const inPersonNames = new Set((transcriptResult?.attendance.in_person ?? []).filter((name) => !absentNames.has(name) && !remoteNames.has(name)));
    helperSnapshot.check_ins.forEach((entry) => {
      const name = firstName(entry.name);
      if (absentNames.has(name) || remoteNames.has(name) || inPersonNames.has(name)) return;
      const intention = entry.attendance.toLowerCase();
      if (intention.includes('remote') || intention.includes('joining') || intention.includes('zoom')) remoteNames.add(name);
      else if (intention && !intention.includes('miss') && !intention.includes("can't")) inPersonNames.add(name);
    });
    const unclearNames = rosterFirstNames.filter((name) => !absentNames.has(name) && !remoteNames.has(name) && !inPersonNames.has(name));
    const rollCallGroups = [
      { title: 'In the room', lines: [...inPersonNames] },
      { title: 'Joined remotely', lines: [...remoteNames] },
      { title: 'Confirmed away at Wrap-Up', lines: [...absentNames] },
      { title: 'Attendance needs review', lines: unclearNames },
    ].filter((group) => group.lines.length > 0);
    if (rollCallGroups.length > 0) sections.push({
      title: 'Roll Call',
      intro: 'Who was with us, and how they joined.',
      groups: rollCallGroups,
      source_label: 'Meeting Helper check-ins + final Wrap-Up attendance + transcript reconciliation',
    });

    const energyGroups = helperSnapshot.check_ins.flatMap((entry) => {
      const level = entry.answers.q_energy_level;
      const feeling = typeof entry.answers.q_feeling_today === 'string' ? entry.answers.q_feeling_today.trim() : '';
      const mode = typeof entry.answers.q_energy_mode === 'string' ? entry.answers.q_energy_mode.trim() : '';
      const hardOut = typeof entry.answers.q_hard_out === 'string' ? entry.answers.q_hard_out.trim() : '';
      const lines = [
        typeof level === 'number' ? `Energy ${level}/10${feeling ? ` · ${feeling}` : ''}` : feeling,
        mode,
        hardOut ? `Hard out: ${hardOut}` : '',
      ].filter(Boolean) as string[];
      return lines.length > 0 ? [{ title: firstName(entry.name), lines }] : [];
    });
    if (energyGroups.length > 0) sections.push({
      title: 'How We Arrived',
      intro: 'The energy and capacity people brought into the room.',
      groups: energyGroups,
      tone: 'warm',
      source_label: 'Pre-meeting member inputs shown in the Meeting Helper',
    });

    const newsGroups = [
      { title: 'From Nat', lines: bulletsFrom(helperNotes.news) },
      { title: 'New in the app', lines: bulletsFrom(helperNotes.appnews) },
    ].filter((group) => group.lines.length > 0);
    if (newsGroups.length > 0) sections.push({
      title: 'News from Nat',
      groups: newsGroups,
      source_label: 'Meeting Helper authored notes',
    });

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
    const treasurerDecisions = (transcriptResult?.decisions ?? []).filter((item) => item.section === 'treasurer').map((item) => item.text);
    if ((notesRow.data as any)?.honey_pot_enabled) {
      const treasurerGroups = [
        { title: 'Honey Pot', lines: [`Balance at the meeting: $${helperSnapshot.honey_pot_balance.toFixed(2)}`, ...bulletsFrom(helperNotes.treasurer)] },
        { title: 'What the room decided', lines: treasurerDecisions },
      ].filter((group) => group.lines.length > 0);
      sections.push({
        title: 'Treasurer',
        groups: treasurerGroups,
        source_label: 'Meeting Helper + Honey Pot ledger + transcript reconciliation',
      });
    }

    const meetupLines: string[] = [];
    const snapshotNextMeeting = helperSnapshot.next_meeting as any;
    if (snapshotNextMeeting?.event_date) {
      const where = snapshotNextMeeting.location?.trim();
      meetupLines.push(
        `Next HIVE meeting: ${prettyDate(snapshotNextMeeting.event_date)}`
        + `${snapshotNextMeeting.event_time ? ` · ${prettyTime(snapshotNextMeeting.event_time)}` : ''}`
        + `${where ? ` · ${where}` : ''}`
      );
    }
    if (helperSnapshot.help_focus) meetupLines.push(`HIVE Help focus: ${helperSnapshot.help_focus}`);
    if (helperSnapshot.upcoming_hangs.length > 0) {
      meetupLines.push('Upcoming HIVE hangs:');
      helperSnapshot.upcoming_hangs.forEach((hang: any) => {
        meetupLines.push(`    ${hang.title} — ${prettyDate(hang.event_date)}`);
      });
    }
    meetupLines.push(...bulletsFrom(helperNotes.meetups));
    const meetupDecisions = (transcriptResult?.decisions ?? []).filter((item) => item.section === 'meetups').map((item) => item.text);
    if (meetupLines.length > 0) sections.push({
      title: 'Plan the Meet Ups',
      groups: [
        { title: 'On the calendar', lines: meetupLines },
        { title: 'What the room decided', lines: meetupDecisions },
      ].filter((group) => group.lines.length > 0),
      source_label: 'Meeting Helper calendar + authored notes + transcript reconciliation',
    });

    const contextByPerson = new Map((transcriptResult?.member_context ?? []).map((item) => [firstName(item.person), item.context]));
    const dutyLabelByTask = new Map((transcriptResult?.duty_labels ?? []).map((item) => [item.task, item.label]));
    const dutySummaryLine = (duty: typeof dutyRows[number]) => {
      const who = duty.owners.length > 4 ? 'OG HIVE' : duty.owners.join(' & ') || 'Owner needs review';
      return `Confirmed duty: ${duty.status === 'complete' ? '✓ ' : ''}${dutyLabelByTask.get(duty.task) ?? duty.task} — ${who}`;
    };
    const helperCheckInByPerson = new Map(helperSnapshot.check_ins.map((entry) => [firstName(entry.name), entry]));
    const dutyGroupsByPerson = new Map<string, typeof dutyRows>();
    dutyRows.forEach((duty) => {
      const about = duty.about ? firstName(duty.about) : 'Shared / not tied to one HummDinger';
      dutyGroupsByPerson.set(about, [...(dutyGroupsByPerson.get(about) ?? []), duty]);
    });
    const hummdingerNames = [...new Set([
      ...helperSnapshot.roster.map((person) => firstName(person.name)),
      ...dutyGroupsByPerson.keys(),
    ])];
    const hummdingerGroups = hummdingerNames.flatMap((name) => {
      const checkIn = helperCheckInByPerson.get(name);
      const dutiesForPerson = dutyGroupsByPerson.get(name) ?? [];
      const context = contextByPerson.get(name);
      const fallbackContext = checkIn ? [
        answerOf(checkIn.answers, 'q_pop_progress') ? `Progress: ${answerOf(checkIn.answers, 'q_pop_progress')}` : '',
        answerOf(checkIn.answers, 'q_pop_obstacles') ? `Needs / obstacles: ${answerOf(checkIn.answers, 'q_pop_obstacles')}` : '',
        answerOf(checkIn.answers, 'q_pop_priorities') ? `Focus: ${answerOf(checkIn.answers, 'q_pop_priorities')}` : '',
      ].filter(Boolean) : [];
      const dutyLines = dutiesForPerson.map(dutySummaryLine);
      const lines = [
        ...(context ? [context] : fallbackContext),
        ...dutyLines,
      ];
      // `_duties` and its offset ride along only to build `duty_index` below —
      // stripped before this group reaches the stored summary.
      return lines.length > 0
        ? [{ title: name, lines, meta: hdByUser.get(checkIn?.user_id ?? '') ?? undefined, _duties: dutiesForPerson, _dutyOffset: lines.length - dutiesForPerson.length }]
        : [];
    });

    // Which real `action_items` row(s) each "Confirmed duty" line actually
    // is — so a reassignment can write to the real to-do, not just repaint
    // the summary's text. Nat, 2026-08-24, after double-clicking a duty line
    // from "Nic" to "Meg": "does that update the appropriate to do list?"
    // It didn't; this is what makes a real reassign possible. Keyed exactly
    // like SummarySections.tsx's `lineKey()` — section title, group index,
    // line index within that group.
    const dutyIndex: Record<string, { action_item_ids: string[]; owner_ids: (string | null)[] }> = {};
    hummdingerGroups.forEach((group, groupIndex) => {
      (group._duties ?? []).forEach((duty, dutyIdx) => {
        const lineIndex = group._dutyOffset + dutyIdx;
        dutyIndex[`HummDinger Sesh::g${groupIndex}::${lineIndex}`] = {
          action_item_ids: duty.action_item_ids,
          owner_ids: duty.owner_ids,
        };
      });
    });
    hummdingerGroups.forEach((group) => {
      delete (group as { _duties?: unknown })._duties;
      delete (group as { _dutyOffset?: unknown })._dutyOffset;
    });
    if (hummdingerGroups.length > 0) sections.push({
      title: 'HummDinger Sesh',
      intro: 'What people brought, what they asked for, and the current duty ledger that came out of the conversation.',
      groups: hummdingerGroups,
      source_label: `Meeting Helper member inputs + transcript context + ${todoGroups.size} current, non-archived duties`,
    });

    const grantedLines = granted.map((wish) => {
      const owner = wish.user?.name ? firstName(wish.user.name) : 'Someone';
      const granters = (wish.granters ?? [])
        .map((row) => (row.granter?.name ? firstName(row.granter.name) : null))
        .filter(Boolean);
      return `${owner}: ${(wish.title ?? wish.description).slice(0, 90)}${granters.length ? ` — thanks ${granters.join(', ')}` : ''}`;
    });
    const wrapDecisions = (transcriptResult?.decisions ?? [])
      .filter((item) => item.section === 'hummdinger' || item.section === 'wrapup')
      .map((item) => item.text);
    const wrapGroups = [
      { title: 'Confirmed decisions', lines: wrapDecisions },
      { title: 'Wishes granted', lines: grantedLines },
    ].filter((group) => group.lines.length > 0);
    if (wrapGroups.length > 0 || transcriptResult?.overview) sections.push({
      title: 'Wrap-Up',
      intro: transcriptResult?.overview || 'The Helper record is sealed. Transcript reconciliation will appear when a recording is available.',
      groups: wrapGroups,
      source_label: transcript ? 'Meeting Helper + current duties + transcript reconciliation' : 'Meeting Helper + current duties; no transcript was available at seal time',
    });

    if (unresolvedConflicts.length > 0) sections.push({
      title: 'Needs Review',
      intro: 'These sources do not fully agree. The record keeps the discrepancy visible instead of choosing a side.',
      groups: unresolvedConflicts.map((conflict) => {
        const actionItem = conflict.action_item_id
          ? keptTodos.find((todo) => todo.id === conflict.action_item_id)
          : null;
        const duty = conflict.action_item_id
          ? dutyRows.find((row) => row.action_item_ids.includes(conflict.action_item_id!))
          : null;
        return {
          title: conflict.topic,
          lines: [
            conflict.helper_record ? `Helper record: ${conflict.helper_record}` : '',
            conflict.transcript_evidence ? `Transcript evidence: ${conflict.transcript_evidence}` : '',
          ].filter(Boolean),
          review: conflict.action_item_id && actionItem
            ? {
              kind: 'action_item_owner' as const,
              conflict_id: conflict.conflictId,
              action_item_id: conflict.action_item_id,
              task_description: duty?.task ?? cleanJotText(actionItem.description),
              current_owner_id: actionItem.assigned_to ?? undefined,
              current_owner_name: actionItem.assignee?.name ? firstName(actionItem.assignee.name) : undefined,
              summary_line: duty ? dutySummaryLine(duty) : undefined,
            }
            : {
              kind: 'record_correction' as const,
              conflict_id: conflict.conflictId,
            },
        };
      }),
      tone: 'warning',
      source_label: 'Automatic discrepancy check; human review required',
    });

    const narrative = transcriptResult?.overview
      || `${isRebuild ? 'Rebuilt' : 'Sealed'} from the Meeting Helper and ${todoGroups.size} current dut${todoGroups.size === 1 ? 'y' : 'ies'}.${tally ? ` ${tally}.` : ''}`;

    const summaryPayload = {
      ...(isRebuild ? previousGeneratedFields : previous),
      source: 'live_meeting',
      title: `${month} ${hiveName} Meeting`,
      // Live notes supersede the apply nag; an already-applied import keeps its badge.
      import_status: previous.import_status === 'applied' ? 'applied' : 'live',
      summary: narrative,
      // Machine-readable copy for Clive and older consumers. The humane reader
      // places these inside their Helper sections instead of printing them a
      // second time below the outline.
      decisions: transcriptResult?.decisions.map((item) => item.text)
        ?? (previous.import_status === 'applied' ? (previous.decisions as string[] | undefined) ?? [] : []),
      details,
      wishes_surfaced: (previous.wishes_surfaced as unknown[] | undefined) ?? [],
      board_posts_created: [],
      // Preserve the historical meaning of this counter: assignment rows,
      // rather than unique task descriptions. Consumers already show it as a
      // count of created action items. The group count is the honest number
      // used by the human-readable "Who takes what" section.
      action_items_created: keptTodos.length,
      action_item_group_count: todoGroups.size,
      action_item_assignments_seen: keptTodos.length,
      events_created: events.length,
      live_sealed_at: rebuiltAt,
      meeting_helper_snapshot: helperSnapshot,
      duty_index: dutyIndex,
      ...(isRebuild
        ? {
          rebuilt_at: rebuiltAt,
          rebuilt_by: sealedBy,
          rebuild_history: rebuildHistory,
        }
        : {}),
      sections,
      provenance: {
        kind: 'reconciled_helper_record',
        meeting_date: date,
        generated_from: [
          'meeting_helper_notes',
          'meeting_helper_member_inputs',
          'meeting_helper_final_attendance',
          'current_live_todo_ledger',
          ...(transcript ? ['live_transcript_supporting_evidence'] : []),
        ],
        transcript_used: Boolean(reconciled),
        transcript_status: reconciled ? 'reconciled' : 'not_available_at_seal',
        transcript_original_line_count: reconciled?.evidence.originalLineCount ?? 0,
        transcript_evidence_line_count: reconciled?.evidence.evidenceLineCount ?? 0,
        transcript_evidence_truncated: reconciled?.evidence.truncated ?? false,
        helper_structure_preserved: true,
        rebuilt: isRebuild,
        decisions_verified: false,
        conflicts_need_review: unresolvedConflicts.length,
        check_in_period: responsePeriod,
        check_in_response_count: checkIns.length,
        community_member_count: memberNames.size,
      },
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

    // Once a surviving meeting-day task has contributed to a recap, attach it
    // to that meeting. Future repairs can then follow the durable relationship
    // instead of depending forever on a creation-date window.
    if (meetingId && keptTodos.length > 0) {
      const { error: linkError } = await supabaseAdmin
        .from('action_items')
        .update({ meeting_id: meetingId })
        .in('id', keptTodos.map((todo) => todo.id))
        .is('archived_at', null);
      if (linkError) throw linkError;
    }

    // The "what you missed" recap is no longer created here. Nat, 2026-08-24:
    // "I won't ever send that quickly... I'll read through the notes, make
    // sure they're correct, and THEN send." Sealing just seals; the recap
    // preview is a deliberate, separate action she triggers from the meeting
    // summary once she's reviewed it. See post-meeting-recap/index.ts.

    return jsonResponse({
      success: true,
      sealed: true,
      rebuilt: isRebuild,
      meetingId,
      counts: {
        events: events.length,
        todos: todoGroups.size,
        todoAssignments: keptTodos.length,
        excludedRoutingPlaceholders: todos.length - keptTodos.length,
        wishNotes: notes.length,
        granted: granted.length,
      },
    });
  } catch (error) {
    console.error('Seal meeting error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to seal the meeting', 500);
  }
});

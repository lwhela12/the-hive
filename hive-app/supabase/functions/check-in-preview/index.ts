import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { meetingOccurrence, type CheckInMeeting } from '../_shared/checkInSession.ts';
import { PRE_MEETING_CHECK_IN_PATTERN } from '../_shared/checkInPatterns.ts';
import { deliverCheckIn } from '../_shared/checkInDelivery.ts';
import { genericLetter, hiveIsMeetingNow, sendReachEmail, templateIsApproved } from '../_shared/reachMail.ts';
import { hiveMark, hiveSealImg, type HiveMark } from '../_shared/hiveMark.ts';

const PREVIEW_EMAIL = 'natwalstead@gmail.com';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'HIVE <clive@the-hive.app>';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const PACIFIC = 'America/Los_Angeles';

type EventRow = CheckInMeeting & {
  event_date: string;
  community?: { name?: string | null; slug?: string | null; accent_color?: string | null } | null;
};

type HoldMeta = {
  check_in_preview?: boolean;
  check_in_preview_key?: string;
  check_in_event_id?: string;
  check_in_community_id?: string;
  check_in_survey_id?: string;
  check_in_touch?: string;
  check_in_approval?: string;
};

function pacificDate(at = new Date()) {
  return at.toLocaleDateString('en-CA', { timeZone: PACIFIC });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function previewHtml(opts: { hive: string; touch: string; names: string[]; sendHref: string; editHref: string; surveyHref: string; mark: HiveMark }) {
  const count = opts.names.length;
  const when = opts.touch === 'day_of' ? 'today' : 'tomorrow';
  const people = count ? opts.names.map(escapeHtml).join(', ') : 'Nobody — everyone has already filled it in.';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b;line-height:1.5">
    <div style="text-align:center;padding:8px 0 4px">${hiveSealImg(opts.mark, 88)}</div>
    <p style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-align:center;text-transform:uppercase;color:${opts.mark.accent}">Just for Nat · nothing has been sent</p>
    <h1 style="font-size:24px;text-align:center;margin:6px 0;color:${opts.mark.accent}">${escapeHtml(opts.hive)} meets ${when}</h1>
    <p>${count === 1 ? '1 person is' : `${count} people are`} still waiting on <strong>Before we meet</strong>.</p>
    <p style="padding:12px 14px;background:#f6f1e5;border-radius:10px"><strong>Who would receive this:</strong><br>${people}</p>
    <p><strong>Check the exact form first:</strong><br><a href="${escapeHtml(opts.surveyHref)}" style="color:#7c5d29">Open Before we meet for ${escapeHtml(opts.hive)}</a></p>
    <p>People who finish the check-in before you send are removed automatically.</p>
    ${count ? `<p style="margin:26px 0 12px"><a href="${escapeHtml(opts.sendHref)}" style="display:inline-block;background:${opts.mark.accent};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">Yes, send it to ${count}</a></p>` : ''}
    <p><a href="${escapeHtml(opts.editHref)}" style="color:#7c5d29">No, let me edit it first</a></p>
  </div>`;
}

function plainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

async function natProfile(admin: { from: (table: string) => any }) {
  const { data } = await admin.from('profiles').select('id, email').ilike('email', PREVIEW_EMAIL).maybeSingle();
  return data as { id: string; email: string | null } | null;
}

async function pendingForEvent(admin: { from: (table: string) => any }, surveyId: string, event: EventRow) {
  const { data: memberships, error: membershipError } = await admin.from('community_memberships').select('user_id, community_id').eq('community_id', event.community_id);
  if (membershipError) throw new Error('Could not read the people in this HIVE.');
  const { data: completions, error: completionError } = await admin.from('check_in_completions').select('user_id, community_id, occurrence').eq('survey_id', surveyId);
  if (completionError) throw new Error('Could not read completed check-ins.');
  // Some early Tech saves predate the occurrence-receipt table. A saved answer
  // for this HIVE and month is the durable truth; read only its owner/scope,
  // never its answer content.
  const period = event.event_date.slice(0, 7);
  const { data: responses, error: responseError } = await admin.from('survey_responses')
    .select('user_id, community_id, response_period')
    .eq('survey_id', surveyId).eq('community_id', event.community_id).eq('response_period', period);
  if (responseError) throw new Error('Could not read saved check-ins.');
  const complete = new Set<string>();
  for (const row of completions ?? []) {
    if (row.community_id === event.community_id && row.occurrence === meetingOccurrence(event.id)) complete.add(row.user_id);
  }
  for (const row of responses ?? []) complete.add(row.user_id);
  const waiting = [...new Set((memberships ?? [])
    .filter((membership: { user_id: string; community_id: string }) => membership.community_id === event.community_id && !complete.has(membership.user_id))
    .map((membership: { user_id: string }) => membership.user_id))];
  const { data: people, error: peopleError } = waiting.length
    ? await admin.from('profiles').select('id, name').in('id', waiting)
    : { data: [], error: null };
  if (peopleError) throw new Error('Could not read the check-in list.');
  const names = new Map((people ?? []).map((person: { id: string; name?: string | null }) => [person.id, person.name?.trim() || 'A HIVE member']));
  return { waiting, names: waiting.map(id => names.get(id) ?? 'A HIVE member') };
}

async function sendPreview(to: string, html: string, subject: string) {
  if (!RESEND_API_KEY) throw new Error('The preview mail connection is unavailable. Nothing was sent.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text: plainText(html) }),
  });
  if (!response.ok) throw new Error('The preview did not reach Nat. Nothing was sent to members.');
}

async function makeScheduledPreviews(admin: { from: (table: string) => any }) {
  if (!(await templateIsApproved(admin, 'checkIn'))) return { previews: 0, skipped: 'Before we meet is not approved.' };
  const nat = await natProfile(admin);
  if (!nat?.id || !nat.email) return { previews: 0, skipped: 'Nat preview address was not found.' };
  // Both shared check-ins are active at the same time. `maybeSingle()` would
  // fail closed on that healthy pair, so choose the one whose settled title is
  // Before we meet rather than pretending there can only be one open row.
  const { data: activeSurveys, error: surveyError } = await admin.from('surveys').select('id, title').is('community_id', null).eq('is_active', true);
  if (surveyError) throw new Error('Could not read open check-ins.');
  const survey = (activeSurveys ?? []).find((row: { title?: string | null }) => PRE_MEETING_CHECK_IN_PATTERN.test(row.title ?? '')) as { id: string; title: string } | undefined;
  if (!survey?.id) return { previews: 0, skipped: 'Before we meet is not open.' };
  const today = pacificDate();
  const tomorrow = pacificDate(new Date(Date.now() + 86400000));
  const { data: events, error } = await admin.from('events')
    .select('id, event_date, community_id, community:communities!community_id(name, slug, accent_color)')
    .eq('event_type', 'meeting').eq('status', 'scheduled').in('event_date', [today, tomorrow]);
  if (error) throw new Error('Could not read upcoming meetings.');
  let previews = 0;
  for (const event of (events ?? []) as EventRow[]) {
    const touch = event.event_date === today ? 'day_of' : 'day_before';
    const key = `check-in-preview:${event.id}:${touch}`;
    const { data: existing } = await admin.from('notifications').select('id')
      .eq('metadata->>check_in_preview_key', key).in('metadata->>check_in_approval', ['pending', 'sent']).maybeSingle();
    if (existing) continue;
    const { waiting, names } = await pendingForEvent(admin, survey.id, event);
    const hive = event.community?.name ?? 'your HIVE';
    const hold = await admin.from('notifications').insert({
      user_id: nat.id, community_id: event.community_id, notification_type: 'general',
      title: `Before we meet · ${hive} · ${waiting.length} waiting`,
      content: `${waiting.length} people would receive a reminder only if Nat says yes.`,
      email_sent: true,
      metadata: { check_in_preview: true, check_in_preview_key: key, check_in_event_id: event.id,
        check_in_community_id: event.community_id, check_in_survey_id: survey.id, check_in_touch: touch,
        check_in_approval: 'pending', check_in_recipients: waiting.length },
    }).select('id').single();
    if (hold.error || !hold.data?.id) throw new Error('Could not save the check-in preview.');
    const holdId = hold.data.id as string;
    const surveyHref = `${APP_URL}/beforewemeet?meeting=${encodeURIComponent(event.id)}`;
    const mark = hiveMark(event.community?.slug, event.community?.accent_color);
    const html = previewHtml({ hive, touch, names, mark, surveyHref, sendHref: `${APP_URL}/approve-check-in/${encodeURIComponent(holdId)}?action=send`, editHref: `${APP_URL}/admin` });
    await sendPreview(nat.email, html, `[Waiting on you] ${hive} · Before we meet`);
    previews += 1;
  }
  return { previews };
}

async function sendHeldCheckIn(admin: { from: (table: string) => any }, actorId: string, holdId: string) {
  const { data: actor } = await admin.from('profiles').select('email').eq('id', actorId).maybeSingle();
  if (!actor?.email || actor.email.toLowerCase() !== PREVIEW_EMAIL) return errorResponse('This check-in preview is for Nat to send.', 403);
  const { data: hold } = await admin.from('notifications').select('id, metadata').eq('id', holdId).maybeSingle();
  const meta = (hold?.metadata ?? {}) as HoldMeta;
  if (!hold || !meta.check_in_preview || meta.check_in_approval !== 'pending' || !meta.check_in_event_id || !meta.check_in_community_id || !meta.check_in_survey_id) {
    return errorResponse('That check-in preview is no longer waiting.', 409);
  }
  const { data: event } = await admin.from('events').select('id, event_date, community_id').eq('id', meta.check_in_event_id).eq('status', 'scheduled').maybeSingle();
  if (!event) return errorResponse('That meeting is no longer scheduled. Nothing was sent.', 409);
  const expectedDate = meta.check_in_touch === 'day_before'
    ? pacificDate(new Date(Date.now() + 86400000))
    : pacificDate();
  if (event.event_date !== expectedDate) {
    return errorResponse('That private preview is stale. Nothing was sent.', 409);
  }
  if (await hiveIsMeetingNow(admin, event.community_id)) return errorResponse('That HIVE is meeting right now, so nothing was sent.', 409);
  const { waiting } = await pendingForEvent(admin, meta.check_in_survey_id, event as EventRow);
  const day = pacificDate();
  const delivery = await deliverCheckIn(admin, waiting, 'checkIn', day,
    userId => sendReachEmail(admin, userId, 'checkIn', genericLetter('checkIn', {
      buttonLabel: 'Open the check-in', href: `${APP_URL}/beforewemeet?meeting=${encodeURIComponent(event.id)}`, hiveId: event.community_id,
    })),
    (userId, emailed) => ({ user_id: userId, community_id: event.community_id, notification_type: 'general', title: 'Your Before we meet check-in is open', content: 'Tap to fill it in.', email_sent: emailed, metadata: { meeting_id: event.id, check_in_preview_id: holdId } }),
  );
  await admin.from('notifications').update({ metadata: { ...meta, check_in_approval: 'sent', check_in_approved_at: new Date().toISOString(), check_in_sent_to: delivery.emailed } }).eq('id', holdId);
  return jsonResponse({ reached: delivery.emailed, skipped: delivery.suppressed, delivery_failed: delivery.delivery_failed });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  let body: { action?: string; hold_id?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* scheduled call is an empty object */ }
  const authHeader = req.headers.get('Authorization') ?? '';
  const bySchedule = !!serviceKey && authHeader === `Bearer ${serviceKey}` && !body.action;
  if (bySchedule) {
    try { return jsonResponse(await makeScheduledPreviews(admin)); }
    catch (error) { console.error('[check-in-preview]', error); return errorResponse('Could not prepare the private check-in previews.', 503); }
  }
  if (body.action !== 'send' || !body.hold_id) return errorResponse('This check-in preview needs Nat’s signed-in approval.', 403);
  const auth = await verifySupabaseJwt(authHeader);
  if (isAuthError(auth) || !(await isOwner(admin, auth.userId))) return errorResponse('This check-in preview needs Nat’s signed-in approval.', 403);
  return sendHeldCheckIn(admin, auth.userId, body.hold_id);
});

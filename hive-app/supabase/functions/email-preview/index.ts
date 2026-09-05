import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { reachEmailHtml, genericLetter, plainTextFrom, templateRevision, scopeLetter, type Reach } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';

/**
 * EVERY TEMPLATED EMAIL HIVE SENDS, RENDERED, ON ONE PAGE. IT SENDS NOTHING.
 *
 * Nat, 2026-09-04: *"you'll make all the templates today, with the new logos &
 * i'll approve them all just once. Then we dont need to play this game each
 * time."*
 *
 * That is an amendment to The Build Standard, and it is written down there
 * rather than only here: a template — the same words every time with a name and
 * a date slotted in — is approved ONCE. Only freshly written words still
 * preview before every send. The whole reason the old per-send preview existed
 * was that a machine was composing prose; a letter with nothing in it to tweak
 * has nothing to review.
 *
 * **It renders the REAL builder, never a copy.** `reachEmailHtml` is imported
 * from the same module the five senders use, so what she approves here is
 * character-for-character what lands in an inbox. A second copy of a template,
 * kept for previewing, is the `hiveMark.ts` trap with the stakes reversed: she
 * would be approving something nobody receives. This is also the house rule —
 * *"a preview whose link works differently from the real send is how 'it's not
 * working' gets missed for months."*
 *
 * Owner-only, and **it still takes no recipient**. Nat, 2026-09-04: *"put one
 * of each type in my inbox."* So `POST { send: true }` mails the set — to the
 * caller's OWN address, read off their profile, and nowhere else. There is no
 * `to` parameter to hand it, which is the property that stops this becoming a
 * way to post a HIVE-signed letter to a stranger. Reading it is a GET and
 * sends nothing; the two are separate on purpose.
 *
 * **A specimen has to look like a specimen.** Nat's rule, from a fake notice
 * that once sent her hunting through the app for something that had not
 * happened: every one of these carries `[Test]` on the subject and a band
 * across the top saying nobody did the thing it describes. The letter under
 * the band is untouched, because the letter is the thing being approved.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The band that stops a specimen being mistaken for news. */
function specimenBanner(name: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto 18px; background: #fff4d6; border: 1px solid #e0c579; border-radius: 12px; padding: 12px 16px; color: #6b5417;">
      <p style="margin: 0; font-size: 13px; line-height: 1.45;">
        <strong>This is a test copy of a template, not a real notification.</strong>
        Nobody messaged you, tagged you or opened a check-in — this is the
        <em>${escapeHtml(name)}</em> letter, sent to you so you can read it.
      </p>
    </div>`;
}

/** Everything a person can be sent that is the same words every time. */
type Sample = {
  key: string;
  /** What Nat calls it when she is deciding whether to keep it. */
  name: string;
  /** When it goes. */
  when: string;
  kind: Reach;
  /** Subject and body together, from the one builder the real senders use. */
  letter: Parameters<typeof reachEmailHtml>[0] & { subject: string };
};

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const refusal = 'Only an owner can read the templates.';
  const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
  if (isAuthError(auth)) return errorResponse(refusal, 403);
  if (!(await isOwner(admin, auth.userId))) return errorResponse(refusal, 403);

  /**
   * THE READER'S OWN NAME, BECAUSE A REAL LETTER CARRIES ONE.
   *
   * Every letter opens "Hi <first name>," — `sendReachEmail` fills it in after
   * it has read the recipient's switch. This page was rendering the templates
   * with no name at all, so the specimen said "Hi there," and the letter that
   * lands says "Hi Nat,". Small, and it broke the only promise this page makes:
   * what is approved here is character-for-character what arrives.
   *
   * Nat found it on 2026-09-04, in her inbox, after approving them.
   */
  const { data: reader } = await admin
    .from('profiles').select('name, email').eq('id', auth.userId).maybeSingle();
  const readerRow = reader as { name?: string | null; email?: string | null } | null;
  const toName = readerRow?.name ?? '';

  // Preview a real meeting early, with the same source binding as its reminder.
  const scopeId = new URL(req.url).searchParams.get('hive');
  const { data: memberships, error: membershipError } = await admin.from('community_memberships')
    .select('community_id').eq('user_id', auth.userId);
  if (membershipError) return errorResponse('Could not read your HIVEs.', 503);
  const memberIds = (memberships ?? []).map(row => row.community_id);
  const meetingScopes = scopeId ? memberIds.filter(id => id === scopeId) : memberIds;
  const { data: meetings, error: meetingError } = await admin.from('events')
    .select('id, community_id, event_date').eq('event_type', 'meeting').eq('status', 'scheduled')
    .in('community_id', meetingScopes.length ? meetingScopes : ['00000000-0000-0000-0000-000000000000'])
    .gte('event_date', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }))
    .order('event_date').order('id').limit(1);
  if (meetingError) return errorResponse('Could not read the meeting for this preview.', 503);
  const previewMeeting = meetings?.[0];
  const previewDay = previewMeeting ? new Date(`${previewMeeting.event_date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }) : '';

  /**
   * FIVE. Nat counted them on 2026-09-04: *"There should only be 5 types of
   * emails that i need to approve: pre meeting survey open, end of the month
   * survey open, newsletter, someone tagged you, someone messaged you, or
   * someone responded to something you wrote."*
   *
   * Being tagged is ONE of them here, not two. It used to be shown twice —
   * tagged by name, and tagged as part of a HIVE — and the two now produce the
   * same letter, because which of the two happened is exactly the sort of
   * detail an inbox is not told. Five senders still exist behind this one
   * sample: boards, rooms and wishes each have their own, personal and group.
   *
   * The Buzz is the sixth thing on her list and is deliberately NOT here. It is
   * written fresh every month, so there is nothing to approve in advance; it
   * previews before every send, which is the half of The Build Standard the
   * 2026-09-04 amendment did not touch.
   */
  const withName = <T,>(letter: T) => ({ ...letter, toName });

  const samples: Sample[] = [
    {
      key: 'message',
      name: 'Somebody sent you a message',
      when: 'When a message lands for you. One per conversation, then quiet until you have opened it.',
      kind: 'message',
      letter: withName(genericLetter('message', {
        buttonLabel: 'Read it and reply',
        href: 'https://app.the-hive.app/messages',
        hiveId: null,
      })),
    },
    {
      key: 'mention',
      name: 'Somebody tagged you',
      when: 'Somebody writes your name — or tags a whole HIVE, or everybody — on a board, in a room, or on a wish.',
      kind: 'mention',
      letter: withName(genericLetter('mention', {
        buttonLabel: 'Go and see',
        href: 'https://app.the-hive.app/board',
        hiveId: null,
      })),
    },
    {
      key: 'boardReply',
      name: 'Somebody replied to your post',
      when: 'A reply on something you put on a board. A post nobody is tagged in sends nothing.',
      kind: 'boardReply',
      letter: withName(genericLetter('boardReply', {
        buttonLabel: 'Read the reply',
        href: 'https://app.the-hive.app/board',
        hiveId: null,
      })),
    },
    {
      key: 'checkIn',
      name: 'Before we meet',
      when: `The day before this HIVE meets. This preview opens its ${previewDay} meeting check-in.`,
      kind: 'checkIn',
      letter: withName(genericLetter('checkIn', {
        buttonLabel: 'Open the check-in',
        href: `https://app.the-hive.app/beforewemeet?meeting=${encodeURIComponent(previewMeeting?.id ?? '')}`,
        hiveId: previewMeeting?.community_id ?? null,
      })),
    },
    {
      key: 'monthCheckIn',
      name: 'End of the month',
      when: 'Three days before the month ends. One for everybody, whichever HIVEs they are in.',
      kind: 'monthCheckIn',
      letter: withName(genericLetter('monthCheckIn', {
        buttonLabel: 'Open the check-in',
        href: 'https://app.the-hive.app/endofmonth',
        hiveId: null,
      })),
    },
  ];

  const { data: approvals, error: approvalError } = await admin.from('email_template_approvals').select('template_key, approved, revision');
  if (approvalError) return errorResponse('Approval records are unavailable. No approval can be assumed.', 503);
  const built = await Promise.all(samples.filter(sample => sample.kind !== 'checkIn' || previewMeeting).map(async (sample) => {
    const hiveId = sample.kind === 'checkIn' ? previewMeeting.community_id
      : sample.kind === 'monthCheckIn' ? null : scopeId;
    const letter = await scopeLetter(admin, { ...sample.letter, hiveId });
    return {
      key: sample.key, name: sample.name, when: sample.when,
      subject: letter.subject, html: reachEmailHtml({ ...letter, toName }),
      revision: await templateRevision(sample.kind), approved: false,
    };
  }));
  for (const template of built) template.approved = approvals?.some(row => row.template_key === template.key && row.approved === true && row.revision === template.revision) ?? false;

  /**
   * POST { send: true } — the set, into the caller's own inbox.
   *
   * One `to:` each, the caller's own address and no other, so there is nothing
   * here that can be pointed at somebody else. Sent one at a time rather than
   * as a batch so a single failure names itself instead of losing the lot.
   */
  if (req.method === 'POST') {
    let wantsSend = false;
    try {
      const body = await req.json();
      if (body?.action === 'approval') {
        const template = built.find(t => t.key === body.key);
        if (!template || typeof body.approved !== 'boolean') return errorResponse('Invalid template approval.', 400);
        if (body.revision !== template.revision) return errorResponse('The words changed. Reload and review them again.', 409);
        const { error } = await admin.from('email_template_approvals').upsert({
          template_key: template.key, revision: template.revision, approved: body.approved,
          reviewed_by: auth.userId, reviewed_at: new Date().toISOString(),
        });
        if (error) return errorResponse('Approval was not saved.', 500);
        return jsonResponse({ key: template.key, revision: template.revision, approved: body.approved });
      }
      wantsSend = body?.send === true;
    } catch { /* an empty POST is not a request to send */ }
    if (!wantsSend) return errorResponse('Send { "send": true } to mail yourself the set.', 400);

    // Only current-revision approvals count. Stale/missing approvals need review.
    const pending = built.filter(template => !template.approved);
    if (pending.length === 0) return jsonResponse({ sent: 0, of: 0, results: [], note: 'All templates are already approved.' });
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'HIVE <clive@the-hive.app>';
    if (!RESEND_API_KEY) return errorResponse('Email is not configured.', 500);

    const to = readerRow?.email;
    if (!to) return errorResponse('Your profile has no email address on it.', 400);

    const results: { key: string; sent: boolean; reason?: string }[] = [];
    for (const template of pending) {
      const html = specimenBanner(template.name) + template.html;
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to,
            // The word that stops a specimen reading as news, before it is opened.
            subject: `[Test] ${template.subject}`,
            html,
            text: plainTextFrom(html),
          }),
        });
        results.push(res.ok
          ? { key: template.key, sent: true }
          : { key: template.key, sent: false, reason: `${res.status}` });
      } catch (err) {
        results.push({ key: template.key, sent: false, reason: String(err) });
      }
    }
    return jsonResponse({
      to,
      sent: results.filter((r) => r.sent).length,
      of: results.length,
      results,
    });
  }

  return jsonResponse({
    /**
     * Said out loud rather than left to be inferred: this page is the templated
     * mail and only the templated mail. The Buzz and anything else written
     * fresh still previews before every send, because there is nothing to
     * approve in advance — it does not exist yet.
     */
    note: 'These are the templates. The Buzz is written fresh each month and still previews before it sends.',
    templates: built,
  });
});

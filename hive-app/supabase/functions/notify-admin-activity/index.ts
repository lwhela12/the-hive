import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { hiveMark, hiveSealImg } from '../_shared/hiveMark.ts';
import { escapeHtml, plainTextFrom, deepLink, hiveIsMeetingNow } from '../_shared/reachMail.ts';

/**
 * Nat, 2026-09-08: *"as admin I want to get an email when anyone does anything
 * in any HIVE — someone answers a daily question, updates a board, creates a
 * wish."* Real-time, one email per action — her choice, made in the moment,
 * over a daily digest.
 *
 * Fired by a database trigger (see migration `254_owners_hear_every_hive_activity`)
 * on insert into `daily_question_answers`, `board_posts`, `board_replies` and
 * `wishes`. The trigger runs inside the member's own write, so it calls this
 * with `net.http_post` (fire-and-forget, does not hold the member's save open)
 * and never lets a failure here roll back their post.
 *
 * Deliberately NOT gated by `templateIsApproved`/the member reach-mail switches
 * in `_shared/reachMail.ts`. This is an explicit personal subscription saved
 * on the recipient's profile. Owners may subscribe to activity across HIVEs;
 * members may subscribe only to activity in HIVEs they belong to.
 *
 * Unlike member-facing mail (`_shared/reachMail.ts`'s `genericLetter`), this
 * one is allowed to say who and what — the entire point is Nat not having to
 * open the app to find out. It still never quotes the words themselves (a
 * board post's content, a wish's description) — just what kind of thing
 * happened, who did it, and which HIVE.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'HIVE <clive@the-hive.app>';

type ActivityKind = 'daily_question' | 'board_post' | 'board_reply' | 'wish';

const KIND_COPY: Record<ActivityKind, { verb: string; button: string; path: string }> = {
  daily_question: { verb: 'answered today’s question', button: 'See it in HIVE', path: '/hive' },
  board_post: { verb: 'posted on a board', button: 'Open the board', path: '/board' },
  board_reply: { verb: 'replied on a board', button: 'Open the board', path: '/board' },
  wish: { verb: 'made a wish', button: 'See the wish', path: '/hive' },
};

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Only the database trigger calls this, carrying the service key. Nothing
  // else has it, and there is no user-facing door here at all.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return errorResponse('This runs on its own trigger.', 403);
  }

  let body: { kind?: string; community_id?: string; actor_id?: string; record_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Bad body.', 400);
  }
  const kind = body.kind as ActivityKind;
  if (!kind || !KIND_COPY[kind]) return errorResponse('Unknown activity kind.', 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  // Meeting Helper, boards and duties are expected to move quickly while a
  // HIVE is together. Those actions are the meeting record, not inbox alerts.
  // The quiet window belongs to the content's HIVE and is dropped rather than
  // queued, so Nat does not get a burst of stale mail when the meeting ends.
  if (body.community_id && await hiveIsMeetingNow(admin, body.community_id)) {
    return jsonResponse({ sent: 0, reason: 'meeting_in_progress' });
  }

  const [{ data: subscribers }, { data: memberships }, { data: actor }, { data: hive }] = await Promise.all([
    // Opt-in for every member. Migration 261 preserves Nat's existing choice
    // and leaves everybody else off until they deliberately turn it on.
    admin.from('profiles').select('id, name, email, is_owner').eq('email_admin_activity_enabled', true),
    body.community_id
      ? admin.from('community_memberships').select('user_id').eq('community_id', body.community_id)
      : Promise.resolve({ data: [] }),
    body.actor_id
      ? admin.from('profiles').select('name').eq('id', body.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    body.community_id
      ? admin.from('communities').select('name, slug, accent_color').eq('id', body.community_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const memberIds = new Set((memberships ?? []).map((membership: { user_id: string }) => membership.user_id));
  const recipients = (subscribers ?? []).filter(
    (subscriber: { id: string; is_owner?: boolean | null }) =>
      subscriber.is_owner === true || memberIds.has(subscriber.id),
  );

  if (!recipients.length || !RESEND_API_KEY) {
    return jsonResponse({ sent: 0, reason: !RESEND_API_KEY ? 'no RESEND_API_KEY' : 'no subscribers' });
  }

  const actorName = (actor as { name?: string } | null)?.name || 'Somebody';
  const hiveRow = hive as { name?: string; slug?: string; accent_color?: string } | null;
  const hiveName = hiveRow?.name ?? 'HIVE';
  const copy = KIND_COPY[kind];
  const mark = hiveMark(hiveRow?.slug, hiveRow?.accent_color);
  const href = deepLink(copy.path, body.community_id ?? null);
  const heading = `${actorName} ${copy.verb}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      <div style="text-align: center; padding: 8px 0 4px;">${hiveSealImg(mark)}</div>
      <p style="text-align: center; color: ${mark.accent}; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${escapeHtml(hiveName)}</p>
      <h1 style="color: ${mark.accent}; font-size: 20px; text-align: center; margin: 8px 0 18px;">${escapeHtml(heading)}</h1>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(href)}" target="_top" style="background: ${mark.accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">${escapeHtml(copy.button)}</a>
      </div>
      <p style="font-size: 12px; color: #b6b6b6; text-align: center;">You asked to hear about activity in your HIVE. You can turn this off in Settings at any time. 🍯</p>
    </div>
  `;
  const subject = `HIVE · ${heading}`;

  let sent = 0;
  for (const recipient of recipients as { id: string; name: string | null; email: string | null }[]) {
    // People already know about the thing they just did. Activity mail is for
    // discovering what happened while they were away from the app.
    if (body.actor_id && recipient.id === body.actor_id) continue;
    if (!recipient.email) continue;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: recipient.email,
          subject,
          html,
          text: plainTextFrom(html),
        }),
      });
      if (res.ok) sent += 1;
      else console.error('[notify-admin-activity] send failed:', await res.text());
    } catch (error) {
      console.error('[notify-admin-activity] send threw:', error);
    }
  }

  return jsonResponse({ sent, kind, hive: hiveName });
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { readLetter, type LetterBlock } from '../_shared/letter.ts';

/**
 * Puts an issue of The Buzz in people's inboxes.
 *
 * This is the piece that was missing. Sign-up (migration 123 +
 * site/api/subscribe.js), the welcome email (subscribe-welcome), unsubscribe
 * (site/api/unsubscribe.js) and the published archive (the public_newsletters
 * view, migration 126) were all built and working. Nothing mailed an issue,
 * so The Buzz has only ever reached people who went looking for it. Nat,
 * 2026-08-12: *"we have the sign up button on the public facing site &
 * inside the app, right?"* — she did, and that was the half that existed.
 *
 * ONE SOURCE, THREE DESTINATIONS. Nat's own requirement: *"i also want
 * whatever is in the email to be on HIVE wide & public site, so we need to
 * make sure that flow is clean & nothing gets lost."* That is why the only
 * thing a caller may name is a POST ID. This function reads the issue out of
 * `board_posts` itself — the same row the in-app archive reads and the same
 * row the `public_newsletters` view publishes — so the email cannot drift
 * from what everybody else sees, and a caller can never hand it arbitrary
 * HTML to mail out. An owner-only mailer that accepts a body of HTML is a
 * spam cannon one leaked token away; this one can only ever send something
 * already published inside HIVE.
 *
 * It renders with `readLetter`, the SAME parser the in-app letter and The
 * Buzz screen use, so headings stay headings and lists stay lists in the
 * email too.
 *
 * WHO GETS IT. Migration 123's comment described the intended rule before
 * there was anything to implement it: members come from
 * `profiles.email_newsletter_enabled`, everyone else from
 * `newsletter_subscribers`, and the two are merged and de-duplicated at send
 * time. That is what happens here. A subscriber row wins a tie because it
 * carries the unsubscribe token.
 *
 * Members and subscribers leave by different doors, and the footer says so
 * honestly: a subscriber gets a real one-click unsubscribe link carrying
 * their own token; a member gets pointed at Settings, because deleting a
 * member's account newsletter preference is not this function's business.
 * Either way every email carries a way out, which is what CAN-SPAM asks for
 * and what the welcome email already did.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@the-hive.app>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://the-hive.app';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';

/** Resend's batch endpoint takes 100 at a time. */
const BATCH_SIZE = 100;

type Recipient = { email: string; name: string | null; token: string | null };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A letter block, as email HTML.
 *
 * Inline styles only, and tables nowhere: every mail client strips a
 * stylesheet, and the shapes here are simple enough not to need a grid.
 */
function blockHtml(block: LetterBlock): string {
  switch (block.kind) {
    case 'heading':
      return `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:28px;color:#2c2418;margin:28px 0 8px;">${escapeHtml(block.text)}</h2>`;
    case 'attribution':
      return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#8a6a2f;margin:-8px 0 16px 19px;">— ${escapeHtml(block.text)}</p>`;
    case 'label':
      return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:#8a6a2f;margin:22px 0 6px;font-weight:bold;">${escapeHtml(block.text)}</p>`;
    case 'bullet':
      return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#3a3327;margin:4px 0 4px 18px;">• ${escapeHtml(block.text)}</p>`;
    case 'numbered':
      return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#3a3327;margin:4px 0 4px 18px;"><strong style="color:#8a6a2f;">${escapeHtml(block.marker)}.</strong> ${escapeHtml(block.text)}</p>`;
    case 'dated':
      return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#3a3327;margin:6px 0;"><strong style="color:#8a6a2f;">${escapeHtml(block.when)}:</strong> ${escapeHtml(block.text)}</p>`;
    case 'quote':
      return `<blockquote style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:16px;line-height:26px;color:#5a4f3c;border-left:3px solid #e3d4ac;margin:16px 0;padding:2px 0 2px 16px;">${escapeHtml(block.text)}</blockquote>`;
    default:
      return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#3a3327;margin:12px 0;">${escapeHtml(block.text)}</p>`;
  }
}

function issueHtml(title: string, content: string, footerHtml: string): string {
  const body = readLetter(content).map(blockHtml).join('\n');
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4efe2;">
    <div style="max-width:600px;margin:0 auto;padding:28px 20px 40px;">
      <div style="text-align:center;padding-bottom:18px;">
        <div style="font-size:30px;line-height:34px;">🐝</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8a6a2f;padding-top:6px;">The Buzz</div>
      </div>
      <div style="background:#fffdf5;border:1px solid #e3d4ac;border-radius:16px;padding:26px 26px 30px;">
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:33px;color:#2c2418;margin:0 0 18px;">${escapeHtml(title)}</h1>
        ${body}
      </div>
      <div style="text-align:center;padding-top:22px;">
        <a href="${PUBLIC_SITE_URL}" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#8a6a2f;text-decoration:none;font-weight:bold;">Read everything at the-hive.app →</a>
      </div>
      ${footerHtml}
    </div>
  </body>
</html>`;
}

/** Members leave through Settings; subscribers leave through their token. */
function footerFor(recipient: Recipient): string {
  const out = recipient.token
    ? `<a href="${PUBLIC_SITE_URL}/api/unsubscribe?token=${encodeURIComponent(recipient.token)}" style="color:#9a8a6a;">Unsubscribe any time</a>, one click, no questions asked.`
    : `You get this because you are in a HIVE. <a href="${APP_URL}/settings" style="color:#9a8a6a;">Turn it off in Settings</a> whenever you like.`;
  return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#9a8a6a;text-align:center;padding-top:18px;margin:0;">${out}</p>`;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!RESEND_API_KEY) return errorResponse('RESEND_API_KEY not configured', 500);

  const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
  if (isAuthError(auth)) return errorResponse(auth.error, auth.status);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Owner only. Mailing everyone HIVE has an address for speaks for the whole
  // organisation to the outside world, which is exactly the boundary
  // migration 128 drew `is_owner` for — not each HIVE's admin.
  const { data: caller } = await supabase
    .from('profiles')
    .select('id, email, name, is_owner')
    .eq('id', auth.userId)
    .maybeSingle();

  if (!caller?.is_owner) return errorResponse('Only a HIVE owner can send the newsletter', 403);

  let body: { postId?: string; mode?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const postId = String(body.postId ?? '').trim();
  const mode = body.mode === 'live' ? 'live' : 'test';
  if (!postId) return errorResponse('postId is required', 400);

  // The issue, read from the same row the app and the public site read.
  const { data: post } = await supabase
    .from('board_posts')
    .select('id, title, content, visibility, status, category:board_categories!category_id(topic_kind)')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return errorResponse('That issue does not exist', 404);

  const topicKind = Array.isArray(post.category)
    ? (post.category[0] as { topic_kind?: string } | undefined)?.topic_kind
    : (post.category as { topic_kind?: string } | null)?.topic_kind;
  if (topicKind !== 'newsletter') {
    return errorResponse('That post is not a newsletter issue', 400);
  }
  if (!String(post.content ?? '').trim()) {
    return errorResponse('That issue is empty — nothing to send', 400);
  }

  // A live send of an issue that already went is almost always a second
  // click, not a decision. Refuse and say so; `force` is the way to mean it.
  if (mode === 'live' && !body.force) {
    const { data: already } = await supabase
      .from('newsletter_sends')
      .select('id, created_at, recipient_count')
      .eq('post_id', postId)
      .eq('mode', 'live')
      .limit(1);
    if (already && already.length > 0) {
      return errorResponse(
        `This issue already went out on ${String(already[0].created_at).slice(0, 10)} to ${already[0].recipient_count} people. Send again only if you mean it.`,
        409
      );
    }
  }

  let recipients: Recipient[] = [];

  if (mode === 'test') {
    if (!caller.email) return errorResponse('Your account has no email address to test with', 400);
    recipients = [{ email: caller.email, name: caller.name ?? null, token: null }];
  } else {
    const [subscriberRes, memberRes] = await Promise.all([
      supabase
        .from('newsletter_subscribers')
        .select('email, name, token')
        .is('unsubscribed_at', null),
      supabase
        .from('profiles')
        .select('email, name')
        .eq('email_newsletter_enabled', true),
    ]);

    // Subscribers first, so their unsubscribe token survives the de-dupe —
    // a member who also signed up publicly should still get the one-click
    // link they were promised when they signed up.
    const byEmail = new Map<string, Recipient>();
    for (const row of (subscriberRes.data ?? []) as Recipient[]) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (email) byEmail.set(email, { email, name: row.name ?? null, token: row.token ?? null });
    }
    for (const row of (memberRes.data ?? []) as { email: string | null; name: string | null }[]) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, { email, name: row.name ?? null, token: null });
    }
    recipients = [...byEmail.values()];
  }

  if (recipients.length === 0) {
    return errorResponse('Nobody to send to — the list is empty', 400);
  }

  const title = String(post.title ?? 'The Buzz');
  const content = String(post.content ?? '');
  const subject = mode === 'test' ? `[TEST] ${title}` : title;

  let sent = 0;
  const failures: string[] = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const payload = batch.map((recipient) => ({
      from: FROM_EMAIL,
      to: recipient.email,
      subject,
      html: issueHtml(title, content, footerFor(recipient)),
    }));

    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      sent += batch.length;
    } else {
      const detail = await res.text().catch(() => '');
      console.error('[send-newsletter] batch failed', res.status, detail.slice(0, 300));
      // Which addresses missed out, so a retry is a decision rather than a
      // guess. The whole batch is reported failed because Resend rejects or
      // accepts the batch as one.
      failures.push(...batch.map((r) => r.email));
    }
  }

  // Logged even for a test, so "did my test actually send?" has an answer
  // that does not live in somebody's inbox.
  await supabase.from('newsletter_sends').insert({
    post_id: postId,
    mode,
    sent_by: caller.id,
    recipient_count: sent,
    failed_count: failures.length,
  });

  return jsonResponse({
    mode,
    sent,
    failed: failures.length,
    failedAddresses: failures.slice(0, 20),
    total: recipients.length,
  });
});

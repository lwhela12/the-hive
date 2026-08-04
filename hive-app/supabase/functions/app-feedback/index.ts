import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';

/**
 * App Feedback — files it, then tells Nat.
 *
 * The screen posts here rather than writing to the table itself, and the table
 * has no insert policy, so this is the only way a row gets made. That is what
 * makes the email trustworthy: the name in the inbox is the name on the JWT, not
 * a name the caller typed. A member cannot file feedback as somebody else,
 * because they never touch the table.
 *
 * Order matters and is deliberate: STORE FIRST, then email. Resend can be down,
 * the key can be missing, a domain can be mid-move — none of that is a reason
 * to lose what somebody took the trouble to write. A stored row with no email
 * is a recoverable problem; an email with no row is a note that exists only in
 * an inbox. So the response says `stored` and `emailed` separately, and the app
 * only apologises for the second one.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const MAX_ATTACHMENTS = 6;

type Attachment = {
  id: string;
  url: string;
  filename: string;
  size: number;
  mime_type: string;
  width?: number;
  height?: number;
};

/**
 * Only files this caller uploaded, and only from our own bucket.
 *
 * The screen uploads to `attachments/<uid>/…` first and posts the resulting
 * public URLs here, because that is how every other attachment in the app
 * already works. What it means is that the URL arrives from the client, and a
 * URL from the client is a claim, not a fact.
 *
 * Two things go wrong if we believe it. A stranger's URL under somebody else's
 * folder would file their screenshot under this person's name. And any URL at
 * all gets rendered as an <img> in an email to the two people who run the HIVE
 * — which is a tracking pixel, or an image request from Nat's mail client to a
 * server of the sender's choosing, sent from the one message she is most likely
 * to open.
 *
 * Storage already enforces that a member can only write inside their own folder
 * (`(storage.foldername(name))[1] = auth.uid()`), so a URL matching this prefix
 * is provably theirs. Anything else is dropped silently rather than refused:
 * the words are the point, and losing a report over a bad file path would be
 * the wrong trade.
 */
function ownedAttachments(raw: unknown, userId: string): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/attachments/${userId}/`;

  return raw
    .filter((item): item is Attachment => {
      if (!item || typeof item !== 'object') return false;
      const url = (item as Attachment).url;
      return typeof url === 'string' && url.startsWith(prefix);
    })
    .slice(0, MAX_ATTACHMENTS)
    .map((item) => ({
      id: String(item.id ?? ''),
      url: item.url,
      filename: String(item.filename ?? 'attachment').slice(0, 200),
      size: Number(item.size) || 0,
      mime_type: String(item.mime_type ?? 'application/octet-stream').slice(0, 100),
      ...(Number(item.width) ? { width: Number(item.width) } : {}),
      ...(Number(item.height) ? { height: Number(item.height) } : {}),
    }));
}

const KINDS = ['bug', 'idea', 'confusing', 'love'] as const;
type Kind = (typeof KINDS)[number];

/** How each kind should read in a subject line, so the inbox sorts itself. */
const KIND_LABEL: Record<Kind, string> = {
  bug: 'Something is broken',
  idea: 'An idea',
  confusing: 'Something is confusing',
  love: 'Something they love',
};

const KIND_EMOJI: Record<Kind, string> = {
  bug: '🐞',
  idea: '💡',
  confusing: '🤔',
  love: '💛',
};

/**
 * Whatever the member wrote is text, never markup — the same rule `notify`
 * learned the hard way. This email goes to the people who can act on it, so a
 * link smuggled into a bug report would be a link from our verified sending
 * domain, in the one inbox most likely to trust it.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The screenshots, in the email itself.
 *
 * The whole reason to ask for a picture is that looking at it is faster than
 * reading a description of it — so it has to arrive already looking at you, not
 * as a link to click after you have opened the app on a laptop. Images render
 * inline; anything else (a video, a log file) gets a plain link, because an
 * <img> tag pointed at a 40MB clip is a broken box in an inbox.
 *
 * Every URL here has already been proved to live in this caller's own folder in
 * our bucket (see `ownedAttachments`), which is what makes it safe to let an
 * email client fetch it.
 */
function attachmentsHtml(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';

  const images = attachments.filter((a) => a.mime_type.startsWith('image/'));
  const others = attachments.filter((a) => !a.mime_type.startsWith('image/'));

  const imageBlocks = images
    .map(
      (a) => `
      <a href="${escapeHtml(a.url)}" style="display:block;margin-top:12px;">
        <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.filename)}"
             style="max-width:100%;border-radius:12px;border:1px solid rgba(189,147,72,0.3);" />
      </a>`
    )
    .join('');

  const otherBlocks = others
    .map(
      (a) => `
      <p style="margin:8px 0 0;font-size:13px;">
        <a href="${escapeHtml(a.url)}" style="color:#bd9348;">${escapeHtml(a.filename)}</a>
      </p>`
    )
    .join('');

  return `
    <p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8e7a5e;margin:20px 0 0;">
      ${images.length > 0 ? 'What they saw' : 'Attached'}
    </p>
    ${imageBlocks}${otherBlocks}`;
}

/** Newlines survive into the email; they are usually the shape of the report. */
function paragraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;">${block.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let payload: {
    action?: string;
    kind?: string;
    message?: string;
    where_in_app?: string | null;
    community_id?: string | null;
    platform?: string | null;
    attachments?: unknown;
    feedback_id?: string;
    reply?: string;
    status?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return errorResponse('Expected a JSON body', 400);
  }

  // ─── Answering one ────────────────────────────────────────────────────────
  //
  // The other half of the loop, and the reason any of this is worth building.
  // A form that only takes is a form people fill in once. Nat, 2026-08-04:
  // "does it show the turn around and the fix as well? or just a list of
  // grievances?" — it was a list of grievances, so now it answers.
  //
  // Owner-only, checked here against `profiles.is_owner` rather than trusted
  // from the body. It goes through the function for the same reason filing does:
  // the name on a reply is the name on the JWT.
  if (payload.action === 'reply') {
    const { data: me } = await supabaseAdmin
      .from('profiles')
      .select('name, is_owner')
      .eq('id', auth.userId)
      .maybeSingle();

    if (!me?.is_owner) {
      return errorResponse('Only the people who run the HIVE can answer feedback', 403);
    }

    const feedbackId = (payload.feedback_id ?? '').trim();
    if (!feedbackId) return errorResponse('Which one?', 400);

    const reply = (payload.reply ?? '').trim();
    if (reply.length > 4000) {
      return errorResponse('That reply is longer than the form can take', 400);
    }

    const status = ['new', 'read', 'done'].includes(payload.status ?? '')
      ? (payload.status as string)
      : reply
        ? 'done'
        : 'read';

    const { data: updated, error: replyError } = await supabaseAdmin
      .from('app_feedback')
      .update({
        status,
        ...(reply
          ? {
              reply,
              replied_at: new Date().toISOString(),
              replied_by: auth.userId,
              replied_by_name: me.name ?? 'The HIVE',
            }
          : {}),
      })
      .eq('id', feedbackId)
      .select('id, author_id, kind, message, reply, status')
      .single();

    if (replyError || !updated) {
      console.error('Could not answer feedback:', replyError);
      return errorResponse('Could not save that answer', 500);
    }

    // Tell them. A reply nobody sees is the same as no reply — and the person
    // who reported a bug three weeks ago is not sitting on the feedback screen
    // waiting.
    let notified = false;
    if (reply && updated.author_id && RESEND_API_KEY) {
      try {
        // Deliberately NOT gated on `preferred_contact`. That flag exists to stop
        // the app broadcasting at people; this is a direct answer to something
        // this person wrote and asked about, which is the one email in the app
        // nobody has to opt in to receive.
        const { data: recipient } = await supabaseAdmin
          .from('profiles')
          .select('email, name')
          .eq('id', updated.author_id)
          .maybeSingle();

        if (recipient?.email) {
          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#313130;">
              <p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8e7a5e;margin:0 0 4px;">App Feedback</p>
              <h1 style="font-size:20px;margin:0 0 16px;color:#313130;">${escapeHtml(me.name ?? 'The HIVE')} answered you</h1>
              <p style="font-size:14px;color:#8e7a5e;margin:0 0 6px;">You said:</p>
              <div style="border-left:3px solid rgba(189,147,72,0.4);padding-left:14px;margin:0 0 18px;color:#4b4740;font-size:14px;">
                ${paragraphs(updated.message || 'You sent a screenshot.')}
              </div>
              <div style="background:#fffdf5;border:1px solid rgba(189,147,72,0.3);border-radius:14px;padding:18px;">
                ${paragraphs(reply)}
              </div>
              <p style="font-size:13px;color:#8e7a5e;margin-top:20px;">
                <a href="${APP_URL}/app-feedback" style="color:#bd9348;">See it in the HIVE</a>
              </p>
            </div>
          `;

          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [recipient.email],
              subject: `💛 About the thing you told us`,
              html,
            }),
          });

          notified = response.ok;
          if (!response.ok) {
            console.error('Resend refused the reply email:', await response.text());
          }
        }
      } catch (error) {
        // The reply is saved. It will be read in the app either way.
        console.error('Could not email the reply:', error);
      }
    }

    return jsonResponse({ id: updated.id, status: updated.status, notified });
  }

  // ─── Filing one ───────────────────────────────────────────────────────────

  const kind = (KINDS as readonly string[]).includes(payload.kind ?? '')
    ? (payload.kind as Kind)
    : 'bug';

  const message = (payload.message ?? '').trim();
  if (message.length > 4000) {
    return errorResponse('That is longer than this form can take', 400);
  }

  const whereInApp = (payload.where_in_app ?? '').trim().slice(0, 300) || null;
  const platform = (payload.platform ?? '').trim().slice(0, 40) || null;
  const attachments = ownedAttachments(payload.attachments, auth.userId);

  // Words or a picture. A screenshot with a red circle on it is a complete bug
  // report; an empty form is not.
  if (!message && attachments.length === 0) {
    return errorResponse('Say something, or drop in a screenshot', 400);
  }

  // Who is talking. Read from the database rather than trusted from the body —
  // the caller could claim any name, and this one goes in an email.
  const { data: author } = await supabaseAdmin
    .from('profiles')
    .select('name, email')
    .eq('id', auth.userId)
    .maybeSingle();

  const authorName = author?.name ?? 'Someone in the HIVE';

  // The HIVE they were standing in, if any. Checked rather than believed: a
  // stranger's community id in the body would otherwise file their note against
  // a HIVE they are not in, which is a small lie that would live in Nat's inbox.
  let communityId: string | null = null;
  let communityName = 'HIVE-Wide';
  if (payload.community_id) {
    const { data: membership } = await supabaseAdmin
      .from('community_memberships')
      .select('community_id, communities(name)')
      .eq('community_id', payload.community_id)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (membership) {
      communityId = membership.community_id as string;
      communityName = (membership as any).communities?.name ?? 'a HIVE';
    }
  }

  // 1. Store it. If this fails, nothing else happens — there is no point
  //    announcing a report we did not keep.
  const { data: stored, error: storeError } = await supabaseAdmin
    .from('app_feedback')
    .insert({
      author_id: auth.userId,
      author_name: authorName,
      community_id: communityId,
      kind,
      message,
      where_in_app: whereInApp,
      platform,
      attachments,
    })
    .select('id, created_at')
    .single();

  if (storeError || !stored) {
    console.error('Could not store app feedback:', storeError);
    return errorResponse('Could not save that. Try again in a moment.', 500);
  }

  // 2. Tell the people who can do something about it. Owners, from the database
  //    (migration 128) — not a hardcoded address, so it stays right if the list
  //    of people running the HIVE ever changes.
  let emailed = false;
  if (RESEND_API_KEY) {
    try {
      const { data: owners } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('is_owner', true);

      const recipients = (owners ?? [])
        .map((o: { email: string | null }) => o.email)
        .filter((email: string | null): email is string => !!email);

      if (recipients.length > 0) {
        const subject = `${KIND_EMOJI[kind]} ${KIND_LABEL[kind]} — ${authorName}`;
        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#313130;">
            <p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8e7a5e;margin:0 0 4px;">App Feedback</p>
            <h1 style="font-size:20px;margin:0 0 16px;color:#313130;">${escapeHtml(KIND_LABEL[kind])}</h1>
            <div style="background:#fffdf5;border:1px solid rgba(189,147,72,0.3);border-radius:14px;padding:18px;">
              ${message ? paragraphs(message) : '<p style="margin:0;color:#8e7a5e;font-style:italic;">No words — see the picture below.</p>'}
            </div>
            ${attachmentsHtml(attachments)}
            <table style="margin-top:16px;font-size:13px;color:#8e7a5e;">
              <tr><td style="padding-right:12px;">From</td><td style="color:#313130;">${escapeHtml(authorName)}</td></tr>
              <tr><td style="padding-right:12px;">Standing in</td><td style="color:#313130;">${escapeHtml(communityName)}</td></tr>
              ${whereInApp ? `<tr><td style="padding-right:12px;">Where</td><td style="color:#313130;">${escapeHtml(whereInApp)}</td></tr>` : ''}
              ${platform ? `<tr><td style="padding-right:12px;">On</td><td style="color:#313130;">${escapeHtml(platform)}</td></tr>` : ''}
            </table>
            <p style="font-size:13px;color:#8e7a5e;margin-top:20px;">
              <a href="${APP_URL}/app-feedback" style="color:#bd9348;">Open the HIVE</a>
            </p>
          </div>
        `;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: recipients,
            subject,
            html,
            // So a reply goes to the person who wrote it rather than into the
            // sending domain, where nobody is reading.
            ...(author?.email ? { reply_to: author.email } : {}),
          }),
        });

        emailed = response.ok;
        if (!response.ok) {
          console.error('Resend refused the feedback email:', await response.text());
        }
      } else {
        console.error('No owner has an email address; feedback stored but unannounced');
      }
    } catch (error) {
      // Stored is stored. An email that did not send is not worth failing over.
      console.error('Could not email the feedback:', error);
    }
  } else {
    console.error('RESEND_API_KEY is not set; feedback stored but unannounced');
  }

  return jsonResponse({ id: stored.id, stored: true, emailed });
});

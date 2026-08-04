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
    kind?: string;
    message?: string;
    where_in_app?: string | null;
    community_id?: string | null;
    platform?: string | null;
  };

  try {
    payload = await req.json();
  } catch {
    return errorResponse('Expected a JSON body', 400);
  }

  const kind = (KINDS as readonly string[]).includes(payload.kind ?? '')
    ? (payload.kind as Kind)
    : 'bug';

  const message = (payload.message ?? '').trim();
  if (!message) {
    return errorResponse('Say something first', 400);
  }
  if (message.length > 4000) {
    return errorResponse('That is longer than this form can take', 400);
  }

  const whereInApp = (payload.where_in_app ?? '').trim().slice(0, 300) || null;
  const platform = (payload.platform ?? '').trim().slice(0, 40) || null;

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
              ${paragraphs(message)}
            </div>
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

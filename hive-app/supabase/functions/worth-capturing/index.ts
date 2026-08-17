/**
 * "You said something worth keeping."
 *
 * Lucas's idea, talked through with Nat on 2026-08-17. A follow-up agent reads
 * meeting transcripts — every meeting either of them has, including ones the
 * other was never on — and when somebody says something genuinely good, it
 * emails **that person**, not a board.
 *
 * Lucas: *"it could just say these are important things, that's good for you to
 * capture, or good for the team to capture, and you can do whatever you want
 * with it... I think it still creates value. There's been plenty of meetings
 * where I would like somebody to say hey, you said this really insightful
 * thing."*
 *
 * And Nat, on why that is what makes a HIVE worth joining: *"seeing your own
 * insights reflected back to you is one thing, but knowing that other people are
 * getting that same notice and they're actually transmitting those ideas into
 * the Tech HIVE, that becomes a reason to join. It's like — what if I could have
 * access to all the cool things that Kelly said, or Lucas said, or Nat said."*
 * Lucas: *"you don't even have to be on the call. We all have access to our own
 * private Reddit thing."*
 *
 * **Three doors, and which ones a person sees depends on where they stand.**
 * Nat named all three, 2026-08-17:
 *
 *   1. In Tech HIVE → **Refine it with Clive**, who is handed the idea already
 *      and can post it to the board when it is ready.
 *   2. Outside, and curious → **ask to join**, which puts them in front of Nat.
 *      She approves, they get a welcome.
 *   3. Outside, and happy there → **a prompt for their own AI**, so the thing
 *      they said is still useful to them. That one is in every email, because
 *      it costs nothing and it is theirs either way.
 *
 * The suggestion is specific about where it belongs — Lucas: *"I suggest putting
 * it into the tech general discussion board"* — because a person who has to
 * choose a board is a person who closes the tab.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://the-hive.app';

/** Tech HIVE keeps the slug `tech`; the library lives there. */
const TECH_SLUG = 'tech';

type Body = {
  /** Who said it. An email address, or a profile id. */
  speaker?: string;
  /** The thing they said, in their own words where possible. */
  insight?: string;
  /** Where it was said — "the Le Mis Tech call, 13 Aug". */
  meeting?: string;
  /** Which board it belongs on, named so nobody has to choose. */
  board?: string;
  /** The topic thread, when there is an obvious one. */
  topic?: string;
  /** Render and return the email rather than sending it. */
  preview?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const LOGO = `
  <div style="text-align: center; padding: 8px 0 4px;">
    <img src="${PUBLIC_SITE_URL}/assets/hive-logo-email.png"
         alt="H.I.V.E." width="72" height="72"
         style="width:72px;height:72px;display:inline-block;border:0;outline:none;text-decoration:none;background:#ffffff;border-radius:36px;" />
  </div>`;

function button(href: string, label: string, filled = true): string {
  const skin = filled
    ? 'background: #2f6f6b; color: #ffffff; border: 1px solid #2f6f6b;'
    : 'background: transparent; color: #2f6f6b; border: 1px solid rgba(47,111,107,0.45);';
  return `<a href="${href}" style="${skin} text-decoration: none; padding: 11px 22px; border-radius: 999px; font-size: 14px; font-weight: 600; display: inline-block; margin: 0 6px 10px 0;">${label}</a>`;
}

/**
 * The prompt a person can take away and use anywhere.
 *
 * Written as an instruction to their AI rather than a summary for them, because
 * the thing they want is the next version of the idea, not a transcript of the
 * old one.
 */
function ownPrompt(insight: string, meeting: string): string {
  return `I said this in ${meeting}:\n\n"${insight}"\n\n`
    + `Help me sharpen it. Ask me what I actually meant where it is vague, `
    + `tell me where it is already true and where it needs proving, and give me `
    + `back a version short enough to hand to somebody else.`;
}

function emailHtml(opts: {
  name: string;
  insight: string;
  meeting: string;
  board?: string;
  topic?: string;
  inTechHive: boolean;
  clive: string;
  join: string;
}): string {
  const { name, insight, meeting, board, topic, inTechHive, clive, join } = opts;
  const where = topic
    ? `<strong>${escapeHtml(topic)}</strong> on the <strong>${escapeHtml(board ?? 'Tech HIVE')}</strong> board`
    : board
      ? `the <strong>${escapeHtml(board)}</strong> board`
      : 'a board in <strong>Tech HIVE</strong>';

  const doors = inTechHive
    ? `
      <p style="font-size: 15px; margin: 0 0 6px;">Two minutes with Clive and it is up there:</p>
      ${button(clive, 'Refine it with Clive →')}
      <p style="font-size: 13px; color: #8a8a8a; margin: 2px 0 0;">He already has it. Tell him what you meant, and he posts it to ${where} when you say so.</p>`
    : `
      <p style="font-size: 15px; margin: 0 0 6px;">Tech HIVE is where this kind of thing gets kept — a small group sharing what they are learning about AI, coding and building.</p>
      ${button(join, 'Ask to join Tech HIVE →')}
      <p style="font-size: 13px; color: #8a8a8a; margin: 2px 0 0;">Nat reads every ask herself. If she says yes, you get a welcome and this goes straight onto ${where}.</p>`;

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #2b2b2b; line-height: 1.55;">
    ${LOGO}
    <p style="text-align: center; color: #2f6f6b; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">Worth keeping</p>
    <h1 style="color: #2f6f6b; font-size: 22px; text-align: center; margin: 8px 0 4px;">You said something good</h1>
    <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 22px;">In ${escapeHtml(meeting)}</p>

    <p style="font-size: 15px;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px;">This came up and it is written down nowhere:</p>

    <blockquote style="margin: 16px 0; padding: 14px 18px; background: #f2f7f6; border-left: 3px solid #2f6f6b; border-radius: 0 12px 12px 0; font-size: 15px; color: #24413f;">
      ${escapeHtml(insight)}
    </blockquote>

    <p style="font-size: 15px;">It is yours — do whatever you like with it. If you want it somewhere other people can find it, it belongs on ${where}.</p>

    <div style="margin: 24px 0 8px;">${doors}</div>

    <hr style="border: none; border-top: 1px solid #e8e4d8; margin: 26px 0 18px;" />

    <p style="font-size: 14px; font-weight: 600; margin: 0 0 6px;">Or take it away and work on it yourself</p>
    <p style="font-size: 13px; color: #8a8a8a; margin: 0 0 8px;">Paste this into whichever AI you use:</p>
    <pre style="white-space: pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; background: #faf8f1; border: 1px solid #e8e4d8; border-radius: 12px; padding: 14px 16px; color: #4a4438; margin: 0;">${escapeHtml(ownPrompt(insight, meeting))}</pre>

    <p style="font-size: 12px; color: #a8a8a8; text-align: center; margin-top: 26px;">You are getting this because you were on the call and you said the thing.</p>
  </div>`;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  let body: Body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Body;
  } catch { /* handled by the checks below */ }

  // Same door policy as the library and the check-in cron: the service key from
  // Nat's Mac, or a signed-in owner. Anything that can email a person in Nat's
  // name stays behind that.
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByService = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  if (!calledByService) {
    const refusal = 'This one runs from the inside.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(admin, auth.userId))) return errorResponse(refusal, 403);
  }

  const speakerKey = (body.speaker ?? '').trim().toLowerCase();
  const insight = (body.insight ?? '').trim();
  const meeting = (body.meeting ?? '').trim() || 'a call this week';
  if (!speakerKey) return errorResponse('Who said it? Pass `speaker` as an email or a profile id.', 400);
  if (!insight) return errorResponse('Pass `insight` — the thing they said.', 400);

  const looksLikeId = /^[0-9a-f-]{36}$/i.test(speakerKey);
  const { data: profileRow } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq(looksLikeId ? 'id' : 'email', speakerKey)
    .maybeSingle();
  const speaker = profileRow as { id: string; name: string | null; email: string | null } | null;

  // Somebody who has never signed in still gets the email — Lucas's whole point
  // is that this reaches people wherever they are. Their address IS the id.
  const to = speaker?.email ?? (looksLikeId ? null : speakerKey);
  if (!to) return errorResponse(`No profile ${speakerKey}, and no address to write to.`, 404);
  const name = (speaker?.name ?? '').split(' ')[0] || 'there';

  // Which doors to show. Membership decides it, so nobody is offered a room
  // they are already standing in.
  let inTechHive = false;
  if (speaker?.id) {
    const { data: tech } = await admin
      .from('communities').select('id').eq('slug', TECH_SLUG).maybeSingle();
    const techId = (tech as { id: string } | null)?.id;
    if (techId) {
      const { data: membership } = await admin
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', techId)
        .eq('user_id', speaker.id)
        .maybeSingle();
      inTechHive = !!membership;
    }
  }

  /**
   * Clive, handed the idea already.
   *
   * `/?prefill=` is the chat screen's own parameter and it has been there since
   * the wish-refining flow — so the button opens a conversation that is already
   * about this, rather than an empty box the reader has to re-explain
   * themselves into.
   */
  const board = (body.board ?? '').trim();
  const topic = (body.topic ?? '').trim();
  const prefill = [
    `I said this in ${meeting}:`,
    '',
    `"${insight}"`,
    '',
    board
      ? `Help me sharpen it, then post it to the ${board} board${topic ? ` under "${topic}"` : ''} in Tech HIVE.`
      : 'Help me sharpen it, then post it to the right board in Tech HIVE.',
  ].join('\n');
  const clive = `${APP_URL}/?prefill=${encodeURIComponent(prefill)}`;
  const join = `${APP_URL}/join`;

  const html = emailHtml({ name, insight, meeting, board, topic, inTechHive, clive, join });
  const subject = `🐝 You said something good in ${meeting}`;

  if (body.preview) {
    return jsonResponse({ to, in_tech_hive: inTechHive, subject, html });
  }
  if (!RESEND_API_KEY) return errorResponse('RESEND_API_KEY not configured', 500);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) return errorResponse(`Email failed: ${await res.text()}`, 502);

  return jsonResponse({ sent_to: to, in_tech_hive: inTechHive, meeting, board: board || null });
});

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
import { hiveMark, hiveSealImg } from '../_shared/hiveMark.ts';
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
  /** In preview mode, send the rendered proof here instead of to the speaker. */
  preview_to?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// This letter only ever goes to Tech HIVE — the library lives there — so it
// wears Tech's seal rather than the one-logo-for-everybody the whole app used
// to send. `TECH_SLUG` is the same constant the query below uses, so the
// picture and the recipients can never disagree about whose letter this is.
const LOGO = `
  <div style="text-align: center; padding: 8px 0 4px;">
    ${hiveSealImg(hiveMark(TECH_SLUG))}
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
  topicExists: boolean;
  inTechHive: boolean;
  clive: string;
  join: string;
}): string {
  const { name, insight, meeting, board, topic, topicExists, inTechHive, clive, join } = opts;

  /**
   * Where it would go, said honestly.
   *
   * The first version of this email promised Clive would post it to a page that
   * did not exist yet — Nat went looking for the thread and found nothing
   * there. A page that has to be started is a fine thing to say out loud; a
   * page that is claimed and missing is the thing that costs trust.
   */
  const where = topic
    ? (topicExists
        ? `the <strong>${escapeHtml(topic)}</strong> page on <strong>${escapeHtml(board ?? 'Tech HIVE')}</strong>`
        : `a new page, <strong>${escapeHtml(topic)}</strong>, on <strong>${escapeHtml(board ?? 'Tech HIVE')}</strong>`)
    : board
      ? `the <strong>${escapeHtml(board)}</strong> board`
      : 'a board in <strong>Tech HIVE</strong>';

  /**
   * All three doors, every time, each one saying who it is for.
   *
   * Showing only the door that applied left everybody else reading an email
   * with an unexplained button in it. Nat: *"otherwise people will be like
   * 'whhhat?!'"* So the layers are spelled out — in Tech HIVE, want to be, and
   * happy where you are — and a reader places themselves in one line.
   */
  const doorOne = `
    <div style="border: 1px solid ${inTechHive ? '#2f6f6b' : '#e8e4d8'}; background: ${inTechHive ? '#f2f7f6' : '#ffffff'}; border-radius: 14px; padding: 16px 18px; margin: 0 0 12px;">
      <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #2f6f6b;">Already in Tech HIVE${inTechHive ? ' — that is you' : ''}</p>
      <p style="margin: 0 0 12px; font-size: 14px;">Clive already has this. Tell him what you actually meant, and when you are happy say <em>&ldquo;post it&rdquo;</em> — he writes it up on ${where} himself.</p>
      ${button(clive, 'Refine it with Clive →', inTechHive)}
    </div>`;

  const doorTwo = `
    <div style="border: 1px solid ${inTechHive ? '#e8e4d8' : '#2f6f6b'}; background: ${inTechHive ? '#ffffff' : '#f2f7f6'}; border-radius: 14px; padding: 16px 18px; margin: 0 0 12px;">
      <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #2f6f6b;">Want to be in Tech HIVE?</p>
      <p style="margin: 0 0 12px; font-size: 14px;">It is a small group swapping what they are learning about AI, coding and building things. Ask for a seat and Nat reads it herself — if she says yes, you get a welcome and this idea has somewhere to live.</p>
      ${button(join, 'Get on the list →', !inTechHive)}
    </div>`;

  const doorThree = `
    <div style="border: 1px solid #e8e4d8; border-radius: 14px; padding: 16px 18px;">
      <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #2f6f6b;">Happy where you are?</p>
      <p style="margin: 0 0 10px; font-size: 14px;">Completely fine. The idea is yours either way — here is a prompt for whichever AI you already use.</p>
      <pre style="white-space: pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; background: #faf8f1; border: 1px solid #e8e4d8; border-radius: 10px; padding: 13px 15px; color: #4a4438; margin: 0;">${escapeHtml(ownPrompt(insight, meeting))}</pre>
    </div>`;

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #2b2b2b; line-height: 1.55;">
    ${LOGO}
    <p style="text-align: center; color: #2f6f6b; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">Worth keeping</p>
    <h1 style="color: #2f6f6b; font-size: 22px; text-align: center; margin: 8px 0 4px;">You said something good</h1>
    <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 22px;">In ${escapeHtml(meeting)}</p>

    <p style="font-size: 15px;">Hi ${escapeHtml(name)},</p>

    <!-- What this even is. Nat: "maybe even say something like you're getting
         this email because Tech HIVE is trying something new; trying to make
         sure we preserve the genius." -->
    <p style="font-size: 14px; color: #5c5c5c; background: #faf8f1; border-radius: 12px; padding: 13px 16px; margin: 0 0 20px;">
      Tech HIVE is trying something new. Good ideas get said out loud in meetings all the time and then evaporate, so we have something reading along and catching the ones worth keeping. When it catches one of yours, you get an email like this. Nobody else has seen it — what happens next is yours to pick.
    </p>

    <p style="font-size: 15px;">Here is the bit it caught:</p>

    <blockquote style="margin: 16px 0 20px; padding: 14px 18px; background: #f2f7f6; border-left: 3px solid #2f6f6b; border-radius: 0 12px 12px 0; font-size: 15px; color: #24413f;">
      ${escapeHtml(insight)}
    </blockquote>

    <p style="font-size: 15px; margin: 0 0 14px;">Three ways to take it from here. Pick the one that is you:</p>

    ${doorOne}
    ${doorTwo}
    ${doorThree}

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
  const { data: tech } = await admin
    .from('communities').select('id').eq('slug', TECH_SLUG).maybeSingle();
  const techId = (tech as { id: string } | null)?.id ?? null;

  let inTechHive = false;
  if (speaker?.id && techId) {
    const { data: membership } = await admin
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', techId)
      .eq('user_id', speaker.id)
      .maybeSingle();
    inTechHive = !!membership;
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

  /**
   * Does that page actually exist?
   *
   * The email said Clive would post to a named thread and Nat went looking for
   * it: *"when I went to look for this thread on this board... it didn't
   * exist."* Promising a page that has to be started is fine; claiming one that
   * is missing is what costs trust. So it is checked, and the email says which
   * of the two it is.
   */
  let topicExists = false;
  if (topic && board && techId) {
    const { data: cats } = await admin
      .from('board_categories').select('id, name').eq('community_id', techId);
    const cat = ((cats ?? []) as { id: string; name: string }[])
      .find((c) => c.name.toLowerCase() === board.toLowerCase())
      ?? ((cats ?? []) as { id: string; name: string }[])
        .find((c) => c.name.toLowerCase().includes(board.toLowerCase()));
    if (cat) {
      const { data: existing } = await admin
        .from('board_posts').select('id')
        .eq('category_id', cat.id).ilike('title', topic)
        .is('archived_at', null).limit(1);
      topicExists = !!((existing ?? []) as unknown[]).length;
    }
  }
  /**
   * The opening line, written to make Clive ASK rather than finish.
   *
   * It used to say "help me sharpen it, then post it", and he did exactly that
   * — one question, three wordings, posted. Nat: *"it was just boop, boop...
   * there's utility in expanding around that thought, because we had that idea
   * in a meeting and we talked about that for quite a while, and then just the
   * one line made it."*
   *
   * A sentence out of a twenty-minute conversation is missing the room it came
   * from, so the ask is for the room back. `chat/index.ts` core behaviour 10
   * carries the same instruction from his side.
   */
  const prefill = [
    `I said this in ${meeting}:`,
    '',
    `"${insight}"`,
    '',
    board
      ? `I want to turn it into a proper page for the ${board} board${topic ? ` — "${topic}"` : ''} in Tech HIVE.`
      : 'I want to turn it into a proper page for the right board in Tech HIVE.',
    'Ask me whatever you need to know first — there was a lot more around this than the one line.',
  ].join('\n');
  // `hive` rides along so Clive comes down into Tech HIVE on arrival — his
  // board tools only ever see the HIVE he is standing in.
  const clive = `${APP_URL}/?prefill=${encodeURIComponent(prefill)}`
    + (techId ? `&hive=${encodeURIComponent(techId)}` : '');
  const join = `${APP_URL}/join`;

  const html = emailHtml({ name, insight, meeting, board, topic, topicExists, inTechHive, clive, join });
  const subject = `🐝 You said something good in ${meeting}`;

  if (body.preview) {
    const previewTo = (body.preview_to ?? '').trim().toLowerCase();
    if (previewTo) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(previewTo)) {
        return errorResponse('`preview_to` must be an email address.', 400);
      }
      if (!RESEND_API_KEY) return errorResponse('RESEND_API_KEY not configured', 500);
      const previewHtml = `
        <div style="max-width:560px;margin:0 auto 16px;padding:12px 16px;background:#fff3cd;border:1px solid #e3c565;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45;">
          <strong>TEST PREVIEW — this would go only to ${escapeHtml(name)}.</strong><br />
          Nothing has been sent to them.
        </div>
        ${html}`;
      const previewRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: previewTo,
          subject: `[Preview for ${name}] ${subject}`,
          html: previewHtml,
        }),
      });
      if (!previewRes.ok) return errorResponse(`Preview email failed: ${await previewRes.text()}`, 502);
      return jsonResponse({
        preview_sent_to: previewTo,
        would_send_to: to,
        in_tech_hive: inTechHive,
        topic_exists: topicExists,
        subject,
      });
    }
    return jsonResponse({ to, in_tech_hive: inTechHive, topic_exists: topicExists, subject, html });
  }
  if (!RESEND_API_KEY) return errorResponse('RESEND_API_KEY not configured', 500);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) return errorResponse(`Email failed: ${await res.text()}`, 502);

  return jsonResponse({
    sent_to: to, in_tech_hive: inTechHive, topic_exists: topicExists,
    meeting, board: board || null, clive,
  });
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { hiveSealImg, HIVE_WIDE_MARK } from '../_shared/hiveMark.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { readLetter, type LetterBlock } from '../_shared/letter.ts';
import { hiveIsMeetingNow } from '../_shared/reachMail.ts';

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
/**
 * The Buzz has its own sender, and deliberately does not borrow the app's.
 *
 * `FROM_EMAIL` — the one every other function uses — is
 * `clive@the-hive.app`, which is right for an invite or a notification and
 * wrong for a newsletter: Clive is the in-app assistant, and members know him
 * as something else entirely. Nat, 2026-08-12: *"The Buzz is your voice, and
 * members already know him as something else."* Caught on her very first test
 * send, which arrived from Clive.
 *
 * A separate variable rather than changing `FROM_EMAIL`, because that one is
 * shared with `invite`, `subscribe-welcome` and the notify family, and those
 * are genuinely from the app.
 */
const FROM_EMAIL = Deno.env.get('NEWSLETTER_FROM_EMAIL') || 'HIVE <hello@the-hive.app>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://the-hive.app';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';

/** Resend's batch endpoint takes 100 at a time. */
const BATCH_SIZE = 100;

type Recipient = { email: string; name: string | null; token: string | null; isMember?: boolean };

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
/**
 * A button, written into the letter as a line of its own.
 *
 * `[[BUTTON:tech]]` on its own line becomes the Tech HIVE button, right where
 * it sits in the text. Nat wanted the ask beside the thing being asked about
 * rather than stranded at the bottom (2026-08-12: *"maybe under tech hive we
 * move the interest button up there"*, and for OG *"express your interest
 * here + add button"*).
 *
 * Written as a marker rather than assembled in code so the letter stays ONE
 * source of truth — the button lives in the same text The Buzz and the public
 * site read, and moving it is editing a line, not a deploy.
 *
 * Each wears its own HIVE's colour, Nat's ask: amber for OG, blue for Tech.
 * OG's accent is null in the database (it predates per-HIVE colours and keeps
 * the house gold), so the gold is written here rather than looked up.
 */
const HIVE_BUTTONS: Record<string, { label: string; colour: string; slug: string }> = {
  tech: { label: "I'm interested in Tech HIVE", colour: '#2f4a63', slug: 'tech' },
  og: { label: 'Add me to the OG HIVE waitlist', colour: '#bd9348', slug: 'default' },
};

const BUTTON_LINE = /^\[\[BUTTON:([a-z]+)\]\]$/;

/**
 * A picture, written into the letter as a line of its own.
 *
 * `[[IMAGE:https://…/leo.jpg|Leo in his bee costume]]`. The same marker the app
 * and the public site render — see `LETTER_IMAGE` in `app/(app)/newsletter.tsx`,
 * and keep the three in step.
 *
 * **https only**, because this string is written by a person and comes out the
 * other side as an `src` attribute in mail sent to everybody on the list.
 *
 * `width` as an attribute as well as in the style: Outlook ignores CSS sizing on
 * images, the same reason the masthead logo carries both. 548 is the letter card's
 * inner width, so a photo fills the column and no more.
 */
const IMAGE_LINE = /^\[\[IMAGE:(https:\/\/[^\]|\s]+)(?:\|([^\]]*))?\]\]$/;

function imageHtml(src: string, alt: string): string {
  return `<div style="text-align:center;padding:14px 0;">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="548"
         style="width:100%;max-width:548px;height:auto;border-radius:12px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
  </div>`;
}

function buttonHtml(key: string, recipient: Recipient): string {
  const button = HIVE_BUTTONS[key];
  if (!button) return '';
  const params = new URLSearchParams({ email: recipient.email, hive: button.slug });
  if (recipient.name) params.set('name', recipient.name);
  return `<div style="text-align:center;padding:14px 0 6px;">
    <a href="${PUBLIC_SITE_URL}/api/interested?${params.toString()}"
       style="display:inline-block;background:${button.colour};color:#fffdf5;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:999px;padding:13px 26px;">
      ${button.label} &rarr;
    </a>
  </div>`;
}

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

function issueHtml(title: string, content: string, footerHtml: string, recipient: Recipient): string {
  const body = readLetter(content)
    .map((block) => {
      if (block.kind === 'paragraph') {
        const picture = IMAGE_LINE.exec(block.text);
        if (picture) return imageHtml(picture[1], (picture[2] ?? '').trim());
      }
      const button = block.kind === 'paragraph' ? BUTTON_LINE.exec(block.text) : null;
      return button ? buttonHtml(button[1], recipient) : blockHtml(block);
    })
    .join('\n');
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4efe2;">
    <div style="max-width:600px;margin:0 auto;padding:28px 20px 40px;">
      <!-- The HIVE-WIDE seal, at the one size in the whole app that can hold
           the motto ring. The Buzz goes to everybody, in every HIVE and to
           people in none, so it is the one letter that must not wear a HIVE's
           costume — see HIVE_WIDE_MARK in _shared/hiveMark.ts.
           The white tile is gone with the old file: these seals are transparent
           PNGs, and a round badge on a white square read as a sticker nobody
           had peeled. Width in the tag as well as the style, because Outlook
           ignores CSS sizing on images; alt text because a good many people
           read mail with images off. -->
      <div style="text-align:center;padding-bottom:18px;">
        ${hiveSealImg(HIVE_WIDE_MARK, 120)}
        <!-- The masthead carries the whole title, and the letter starts with
             "Yellow!". It used to say "THE BUZZ" here and then repeat the title
             as a heading inside the card — Nat, 2026-08-12: *"this doubles up a
             little for me... i feel like the light amber 'the buzz' should
             maybe hold this title & we just start with 'yellow!'"* -->
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8a6a2f;padding-top:10px;">${escapeHtml(title)}</div>
      </div>
      <div style="background:#fffdf5;border:1px solid #e3d4ac;border-radius:16px;padding:26px 26px 30px;">
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

/**
 * Everybody gets a real unsubscribe link. Members get Settings as well.
 *
 * This used to give members ONLY a "turn it off in Settings" line, on the
 * reasoning that a member's newsletter preference lives on their profile. Two
 * things were wrong with that, and Nat found both from the reader's side on
 * 2026-08-12: *"that'll only work if you're already a member... they should
 * have a regular unsubscribe button"* — and then, opening Settings, *"the
 * 'turn off newsletter' setting isnt even there."* A link to a switch that
 * did not exist, shown to people who might not have an account at all.
 *
 * The switch exists now (`settings.tsx`), and the one-click link is
 * unconditional. `unsubscribeTokenFor` guarantees every recipient has one,
 * so nobody is ever handed a way out that depends on being able to log in.
 */
function footerFor(recipient: Recipient): string {
  const stop = `<a href="${PUBLIC_SITE_URL}/api/unsubscribe?token=${encodeURIComponent(recipient.token!)}" style="color:#9a8a6a;">Unsubscribe</a> any time — one click, no questions asked.`;
  // On its own line — Nat: "i'd start 'you're in a hive' on a new line."
  const settings = recipient.isMember
    ? `<br />You're in a HIVE, so you can also <a href="${APP_URL}/settings" style="color:#9a8a6a;">manage this in Settings</a>.`
    : '';
  return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#9a8a6a;text-align:center;padding-top:18px;margin:0;">${stop}${settings}</p>`;
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
    .select('id, email, name, is_owner, newsletter_token')
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
    .select('id, title, content, visibility, status, category:board_categories!category_id(topic_kind), community:communities!community_id(max_share_scope)')
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

  if (mode === 'live') {
    const community = Array.isArray(post.community)
      ? (post.community[0] as { max_share_scope?: string } | undefined)
      : (post.community as { max_share_scope?: string } | null);
    if (community?.max_share_scope !== 'public') {
      return errorResponse('This HIVE does not publish to unauthenticated visitors', 403);
    }

    // A public newsletter is an editorial artifact, not a member reach. Check
    // the actual saved issue before a single outside address receives it. The
    // refusal is generic on purpose: the response never reveals who matched.
    const { data: memberRows, error: memberReadError } = await supabase
      .from('profiles')
      .select('name');
    if (memberReadError) {
      return errorResponse('The privacy check could not run, so nothing was sent', 503);
    }

    const issueWords = new Set(
      `${String(post.title ?? '')} ${String(post.content ?? '')}`
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    );
    const namesMember = ((memberRows ?? []) as { name?: string | null }[]).some((row) => {
      const first = String(row.name ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .split(/\s+/)[0];
      return first.length >= 3 && issueWords.has(first);
    });
    if (namesMember) {
      return errorResponse(
        'This public issue names a HIVE member. Remove member names and identity-to-HIVE links, then test again.',
        400
      );
    }
  }

  /**
   * NOT WHILE A HIVE IS MEETING.
   *
   * Nat, 2026-09-04, on what should reach a person: *"you wouldn't get an email
   * notification, I think, during the meeting."* Every other kind of HIVE mail
   * is held at the shared door in `_shared/reachMail.ts`; The Buzz cannot use
   * that door, because half its list are subscribers with no profile to read a
   * switch off — so it asks the same question here.
   *
   * The Buzz belongs to no single HIVE, so it waits for ALL of them: an issue
   * landing mid-meeting would pull the room out of the room, whichever room it
   * happens to be. It is a monthly letter; twenty minutes is nothing to it.
   */
  if (mode === 'live') {
    const { data: allHives } = await supabase.from('communities').select('id, name');
    for (const hive of (allHives ?? []) as { id: string; name: string }[]) {
      if (await hiveIsMeetingNow(supabase, hive.id)) {
        return errorResponse(
          `${hive.name} is in its meeting right now. The Buzz waits until it is over.`,
          409,
        );
      }
    }
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
    // Carrying the real token so a test exercises the real unsubscribe link
    // rather than a dead one — the footer is exactly what everybody else gets.
    recipients = [{
      email: caller.email,
      name: caller.name ?? null,
      token: caller.newsletter_token ?? null,
      isMember: true,
    }];
  } else {
    const [subscriberRes, memberRes] = await Promise.all([
      supabase
        .from('newsletter_subscribers')
        .select('email, name, token')
        .is('unsubscribed_at', null),
      supabase
        .from('profiles')
        .select('email, name, newsletter_token')
        .eq('email_newsletter_enabled', true),
    ]);

    // Subscribers first, so their unsubscribe token survives the de-dupe —
    // a member who also signed up publicly should still get the one-click
    // link they were promised when they signed up. Either token now stops
    // BOTH lists (migration 171), so whichever one wins the tie is fine.
    const byEmail = new Map<string, Recipient>();
    for (const row of (subscriberRes.data ?? []) as Recipient[]) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (email) byEmail.set(email, { email, name: row.name ?? null, token: row.token ?? null });
    }
    for (const row of (memberRes.data ?? []) as { email: string | null; name: string | null; newsletter_token: string | null }[]) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (!email) continue;
      const already = byEmail.get(email);
      if (already) {
        already.isMember = true;
      } else {
        byEmail.set(email, { email, name: row.name ?? null, token: row.newsletter_token ?? null, isMember: true });
      }
    }
    // Nobody goes out without a way back. A recipient with no token at all
    // would be handed a dead unsubscribe link, which is worse than no link.
    recipients = [...byEmail.values()].filter((r) => !!r.token);
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
      // Replies land with Nat. hello@the-hive.app sends and receives nothing
      // (the real inbox is still an open Phase 2 item), and the unsubscribe
      // page's fallback literally says "reply to the newsletter" — found in
      // the post-send audit, 2026-08-12.
      reply_to: Deno.env.get('NEWSLETTER_REPLY_TO') || 'Nat <natwalstead@gmail.com>',
      to: recipient.email,
      subject,
      html: issueHtml(title, content, footerFor(recipient), recipient),
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

  // Sending IS publishing. Nat's rule for the whole pipeline: "whatever is
  // in the email to be on HIVE wide & public site... one shot one kill." The
  // email and HIVE-Wide were covered; the public site reads the
  // public_newsletters view, which only shows visibility='public' — so
  // without this, a sent issue would reach every inbox and never appear on
  // the-hive.app. Only a LIVE send flips it; a test changes nothing.
  if (mode === 'live' && sent > 0 && post.visibility !== 'public') {
    await supabase
      .from('board_posts')
      .update({ visibility: 'public', is_pinned: true })
      .eq('id', postId);
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

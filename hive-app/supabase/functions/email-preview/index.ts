import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { reachEmailHtml, plainTextFrom, REACH_COLUMNS, type Reach } from '../_shared/reachMail.ts';
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
  /** Which switch turns it off, in her words. */
  offSwitch: string;
  kind: Reach;
  subject: string;
  letter: Parameters<typeof reachEmailHtml>[0];
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
   * A real HIVE, so the colour and the emoji in the preview are a real HIVE's.
   *
   * Which one is asked for, defaulting to OG — the check-in email wore
   * Production's purple and clapperboard for weeks because the branding was
   * typed in by hand, and a preview drawn in invented colours is how that
   * survives a reading.
   */
  const url = new URL(req.url);
  const slug = url.searchParams.get('hive') || 'default';
  const { data: hiveRow } = await admin
    .from('communities')
    .select('id, name, slug, accent_color')
    .eq('slug', slug)
    .maybeSingle();
  const hive = hiveRow as
    { id: string; name: string; slug: string; accent_color: string | null } | null;
  if (!hive) return errorResponse('No HIVE by that name.', 404);

  const common = {
    toName: 'Brietta',
    hiveName: hive.name,
    hiveSlug: hive.slug,
    hiveAccent: hive.accent_color,
    hiveId: hive.id,
  };

  const samples: Sample[] = [
    {
      key: 'message',
      name: 'Somebody sent you a message',
      when: 'When a message lands for you. One per conversation, then quiet until you have opened it.',
      offSwitch: 'When a message lands for me',
      kind: 'message',
      subject: `${hive.name} · Nat sent you a message`,
      letter: {
        ...common,
        heading: 'Nat sent you a message',
        where: 'In your messages',
        said: 'Are you still up for Thursday? No pressure either way.',
        buttonLabel: 'Go and see',
        href: 'https://app.the-hive.app/messages',
      },
    },
    /**
     * Being tagged has two shapes, and both are shown rather than one being
     * approved and the other inferred. Nat named both in the same breath:
     * *"somebody tagged you, or a hive you're in."* They share one switch
     * because they are one kind of interruption, and a member who wants to
     * hear their own name almost always wants to hear their HIVE's.
     */
    {
      key: 'mention',
      name: 'Somebody tagged you',
      when: 'Somebody writes @your-name on a board, in a room, or on a wish.',
      offSwitch: 'When somebody tags me, or a HIVE I\u2019m in',
      kind: 'mention',
      subject: `${hive.name} · Nat mentioned you on Favourite Books!`,
      letter: {
        ...common,
        heading: 'Nat mentioned you on Favourite Books!',
        where: 'Favourite Books!',
        said: '@Brietta you were the one who recommended this, weren’t you?',
        buttonLabel: 'Go and see',
        href: 'https://app.the-hive.app/board',
      },
    },
    {
      key: 'groupMention',
      name: 'Somebody tagged a HIVE you\u2019re in',
      when: `Somebody tags a whole HIVE — @${hive.slug === 'default' ? 'og' : hive.slug} — or everyone across all of them with @everyone.`,
      offSwitch: 'When somebody tags me, or a HIVE I\u2019m in',
      kind: 'mention',
      subject: `${hive.name} · Nat mentioned everyone in ${hive.name} on Things We Learned`,
      letter: {
        ...common,
        heading: `Nat mentioned everyone in ${hive.name} on Things We Learned`,
        where: 'Things We Learned',
        said: 'Don’t forget we meet tomorrow — same link as last time.',
        buttonLabel: 'Go and see',
        href: 'https://app.the-hive.app/board',
      },
    },
    {
      key: 'boardReply',
      name: 'Somebody replied to your post',
      when: 'A reply on something you put on a board. A post nobody is tagged in sends nothing.',
      offSwitch: 'When somebody replies to my post',
      kind: 'boardReply',
      subject: `${hive.name} · Nat replied to your post`,
      letter: {
        ...common,
        heading: 'Nat replied to your post',
        where: 'Our Favourite Recipes',
        said: 'I made this last night and it worked. Adding a photo tomorrow.',
        buttonLabel: 'Go and see',
        href: 'https://app.the-hive.app/board',
      },
    },
    {
      key: 'checkIn',
      name: 'Your Before we meet check-in is open',
      when: 'Three days before that HIVE meets, counting the meeting day, when Nat presses send.',
      offSwitch: 'Before we meet',
      kind: 'checkIn',
      subject: `${hive.name} · Your Before we meet check-in is open`,
      letter: {
        ...common,
        heading: 'Your Before we meet check-in is open',
        where: hive.name,
        said: 'It takes a few minutes, and what you write goes straight into the room.',
        buttonLabel: 'Open the check-in',
        href: 'https://app.the-hive.app/monthly-tuneup',
      },
    },
    {
      key: 'monthCheckIn',
      name: 'Your End of the month check-in is open',
      when: 'Three days before the month ends. One for everybody, whichever HIVEs they are in.',
      offSwitch: 'End of the month',
      kind: 'monthCheckIn',
      /**
       * THE ONE TEMPLATE THAT IS NOT ABOUT THE HIVE IN THE PICKER.
       *
       * End of the month belongs to no HIVE (`community_id` null, migration
       * 225), so `open-check-in` sends it with no slug — which means the
       * HIVE-Wide seal, honey gold, and "HIVE ·" on the subject line, whichever
       * HIVEs the reader is in.
       *
       * This spread `common` until 2026-09-04, so the preview dressed it in
       * whichever HIVE was selected above: Tech's navy and Tech's circuit-board
       * seal on a letter that will arrive black and gold. On the page whose
       * whole promise is "what you approve is what lands in an inbox", that is
       * the one template it was not true of.
       */
      subject: 'HIVE · Your End of the month check-in is open',
      letter: {
        toName: common.toName,
        hiveName: 'HIVE',
        hiveSlug: null,
        hiveAccent: null,
        hiveId: null,
        heading: 'Your End of the month check-in is open',
        where: 'Every HIVE',
        said: 'It takes about two minutes, and what you write goes straight into the room.',
        buttonLabel: 'Open the check-in',
        href: 'https://app.the-hive.app/endofmonth',
      },
    },
  ];

  const built = samples.map((sample) => ({
    key: sample.key,
    name: sample.name,
    when: sample.when,
    off_switch: sample.offSwitch,
    column: REACH_COLUMNS[sample.kind],
    subject: sample.subject,
    html: reachEmailHtml(sample.letter),
  }));

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
      wantsSend = body?.send === true;
    } catch { /* an empty POST is not a request to send */ }
    if (!wantsSend) return errorResponse('Send { "send": true } to mail yourself the set.', 400);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'HIVE <clive@the-hive.app>';
    if (!RESEND_API_KEY) return errorResponse('Email is not configured.', 500);

    const { data: me } = await admin
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const to = (me as { email?: string | null } | null)?.email;
    if (!to) return errorResponse('Your profile has no email address on it.', 400);

    const results: { key: string; sent: boolean; reason?: string }[] = [];
    for (const template of built) {
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
      hive: { name: hive.name, slug: hive.slug },
      to,
      sent: results.filter((r) => r.sent).length,
      of: results.length,
      results,
    });
  }

  return jsonResponse({
    hive: { name: hive.name, slug: hive.slug },
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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { reachEmailHtml, REACH_COLUMNS, type Reach } from '../_shared/reachMail.ts';
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
 * Owner-only, and it takes no recipient at all. There is no address to hand it,
 * so it cannot be turned into a way to post a HIVE-signed letter to a stranger.
 */

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
      subject: `${hive.name} · Your End of the month check-in is open`,
      letter: {
        ...common,
        heading: 'Your End of the month check-in is open',
        where: 'Every HIVE',
        said: 'It takes about two minutes, and what you write goes straight into the room.',
        buttonLabel: 'Open the check-in',
        href: 'https://app.the-hive.app/endofmonth',
      },
    },
  ];

  return jsonResponse({
    hive: { name: hive.name, slug: hive.slug },
    /**
     * Said out loud rather than left to be inferred: this page is the templated
     * mail and only the templated mail. The Buzz and anything else written
     * fresh still previews before every send, because there is nothing to
     * approve in advance — it does not exist yet.
     */
    note: 'These are the templates. The Buzz is written fresh each month and still previews before it sends.',
    templates: samples.map((sample) => ({
      key: sample.key,
      name: sample.name,
      when: sample.when,
      off_switch: sample.offSwitch,
      column: REACH_COLUMNS[sample.kind],
      subject: sample.subject,
      html: reachEmailHtml(sample.letter),
    })),
  });
});

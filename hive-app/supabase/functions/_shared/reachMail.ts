/**
 * The one door every "somebody spoke to you" email goes through.
 *
 * Nat, 2026-09-01: *"HIVE already pushes for mentions, board replies, DMs, and
 * wish mentions. We don't have any means of pushing. It's not an app. It's a
 * web app... So I think an email could be nice, because then people could know
 * to go back into the HIVE web app. And the usage has really fallen off."*
 *
 * Two rules live here, and they live here rather than in each of the five
 * notify-* functions on purpose. Checking a member's switch at the door means
 * a NEW kind of mail is one word away from keeping the promise, instead of one
 * forgotten filter away from breaking it.
 *
 *   1. **The recipient decides, never the sender.** There is no "send & email"
 *      anywhere. A sender choosing for each recipient guesses wrong for
 *      somebody, every single time.
 *   2. **A switch that governs nothing is worse than no switch.** Every kind
 *      below has a column, something that sends it, and a row on the Settings
 *      page. `scripts/lint-reach-mail.mjs` fails the build if any of the three
 *      goes missing.
 *
 * **Email only, deliberately.** The five functions still write their in-app row
 * and still fire their Expo push; this adds the channel that actually reaches a
 * browser tab. Nat: *"When it is an app, then they can toggle those on."*
 */

import { hiveMark, hiveSealImg } from './hiveMark.ts';

/** The kinds of mail a member can turn off, and the column that carries each. */
export const REACH_COLUMNS = {
  /**
   * Somebody wrote your name — on a board, in a room, or on a wish.
   *
   * Separate from `boards` on purpose. Somebody may want a quiet board and
   * still want to hear that they were named, and one switch could not say
   * that: the loud half would swallow the half that matters most.
   */
  mention: 'email_mention_enabled',
  /** A message landed in your inbox in the app. */
  message: 'email_message_enabled',
  /** Somebody replied to something you posted. */
  boardReply: 'email_board_reply_enabled',
  /**
   * THE NEWSLETTER IS DELIBERATELY NOT ON THIS RAIL. Considered 2026-09-04 and
   * turned down for a reason worth keeping.
   *
   * Everything here is keyed on a `profiles` row, because `mayReach` reads a
   * member's switch off one. The Buzz also goes to `newsletter_subscribers` —
   * people who signed up on the public site and have no profile at all — so
   * putting it on this rail would have silently dropped the half of the list
   * that is not in a HIVE.
   *
   * It already keeps every promise this rail exists to keep, by its own means:
   * `email_newsletter_enabled` is read at send time, every recipient gets their
   * own `to:` and their own unsubscribe token, and it will not send without
   * `force`. `send-newsletter` asks `hiveIsMeetingNow` itself.
   */
  /**
   * A check-in is open and waiting for you — the pre-meeting one.
   *
   * Nat, 2026-09-04: *"instead of going to my email and then previewing the
   * email and then going back into the app and previewing the survey, I want
   * everything to just happen in the app."* So the mail stopped being a letter
   * a cron wrote at 6am for her to proofread, and became this: short, standard,
   * and set off by her pressing send on a survey she just read.
   */
  checkIn: 'email_meeting_checkin_enabled',
  /** The same, for the one that belongs to the month rather than a meeting. */
  monthCheckIn: 'email_midpoint_checkin_enabled',
} as const;

export type Reach = keyof typeof REACH_COLUMNS;

export const TEMPLATE_BUTTONS: Record<Reach, string> = {
  message: 'Read it and reply', mention: 'Go and see', boardReply: 'Read the reply',
  checkIn: 'Open the check-in', monthCheckIn: 'Open the check-in',
};

/** Hash the actual rendered words, not branding, recipients or destination IDs. */
export async function templateRevision(kind: Reach): Promise<string> {
  const letter = genericLetter(kind, { buttonLabel: TEMPLATE_BUTTONS[kind], href: '__destination__', hiveId: null });
  const words = plainTextFrom(reachEmailHtml({ ...letter, toName: '__reader__' }));
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(letter.subject + '\n' + words));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function templateIsApproved(admin: { from: (t: string) => any }, kind: Reach): Promise<boolean> {
  try {
    const { data, error } = await admin.from('email_template_approvals')
      .select('approved, revision').eq('template_key', kind).maybeSingle();
    return !error && data?.approved === true && data.revision === await templateRevision(kind);
  } catch {
    return false; // Network/schema failures must never become approval.
  }
}

/** Meeting reminders belong to their source HIVE. Other notices keep generic copy. */
export async function scopeLetter(admin: { from: (t: string) => any }, letter: ReturnType<typeof genericLetter>) {
  if (!letter.hiveId) return { ...letter, hiveSlug: null, hiveAccent: null };
  const { data, error } = await admin.from('communities').select('name, slug, accent_color').eq('id', letter.hiveId).maybeSingle();
  if (error || !data) throw new Error('Cannot resolve email scope');
  const meeting = letter.heading === GENERIC_LINE.checkIn.line;
  if (meeting && !data.name) throw new Error('Cannot resolve meeting HIVE');
  return { ...letter, hiveSlug: data.slug, hiveAccent: data.accent_color,
    ...(meeting ? { hiveName: data.name, subject: `${data.name} · ${letter.heading}` } : {}),
  };
}


/** Canonical words. Meeting reminders use their source HIVE's name and seal;
 * message, tag and reply content stays private. */
const GENERIC_LINE: Record<Reach, { line: string; said: string }> = {
  message: {
    line: 'Somebody sent you a message',
    said: 'Open HIVE to read it.',
  },
  mention: {
    // One line for both shapes of being tagged — by name, or as part of a HIVE
    // somebody tagged. Nat listed them as one thing, and the difference between
    // them is exactly the kind of detail an inbox should not be told.
    line: 'Somebody tagged you',
    said: 'Open HIVE to see it.',
  },
  boardReply: {
    line: 'Somebody replied to your post',
    said: 'Open HIVE to read it.',
  },
  checkIn: {
    line: 'You have a meeting tomorrow',
    said: 'Take a moment to fill in Before we meet before we get together.',
  },
  monthCheckIn: {
    line: 'Your end of the month check-in is open',
    said: 'It takes about two minutes.',
  },
};

/**
 * The whole letter for one kind, with nothing in it that could name anybody.
 *
 * Buttons and prose are canonical. The source hiveId selects the seal/colour
 * at the shared sending door and governs meeting quiet time. No private
 * sender, board name or post content is rendered. Branding alone needs no
 * new copy approval.
 */
export function genericLetter(
  kind: Reach,
  opts: { buttonLabel: string; href: string; hiveId: string | null },
): Omit<Parameters<typeof reachEmailHtml>[0], 'toName'> & { subject: string } {
  const { line, said } = GENERIC_LINE[kind];
  return {
    subject: `HIVE \u00b7 ${line}`,
    hiveName: 'HIVE',
    hiveSlug: null,
    hiveAccent: null,
    hiveId: opts.hiveId,
    heading: line,
    said,
    buttonLabel: TEMPLATE_BUTTONS[kind],
    href: opts.href,
  };
}

const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'HIVE <clive@the-hive.app>';

/** Text that arrived from a person, on its way into an HTML document. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The plain-text half. Gmail treats an HTML-only message as a shape to distrust. */
export function plainTextFrom(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * One member, one kind: may we mail them?
 *
 * Fails CLOSED on a missing row and OPEN on a missing column — a person we
 * cannot find gets nothing, and a column that has not been migrated yet is a
 * deploy-order problem rather than a member's decision.
 */
export async function mayReach(
  admin: { from: (t: string) => any },
  userId: string,
  kind: Reach,
): Promise<{ allowed: boolean; email: string | null; name: string }> {
  const column = REACH_COLUMNS[kind];
  const { data, error } = await admin
    .from('profiles')
    // Spelled out literally: a computed select string makes the whole row
    // `any`, and then nothing tells you when a column is wrong.
    .select('email, name, email_mention_enabled, email_message_enabled, email_board_reply_enabled, email_meeting_checkin_enabled, email_midpoint_checkin_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return { allowed: false, email: null, name: '' };
  const row = data as Record<string, unknown>;
  const stored = row[column];
  return {
    allowed: stored !== false && !!row.email,
    email: (row.email as string) ?? null,
    name: (row.name as string) ?? '',
  };
}

/**
 * NOTHING GOES OUT WHILE THAT HIVE IS IN ITS MEETING.
 *
 * Nat, 2026-09-04, listing what should and should not reach a person: *"you
 * wouldn't get an email notification, I think, during the meeting. So that
 * would, we can rule that out."*
 *
 * She is right, and the reason is worth writing down: a meeting is the one
 * hour everybody is already inside the app, together, watching the same deck.
 * That hour is also when the app is written in most — desires captured, wishes
 * granted, to-dos handed out, the Wrap-Up posting a recap — so it is exactly
 * when the mail would be thickest and least useful. Eighteen people would each
 * get a handful of letters about a room they were sitting in.
 *
 * **It is the CONTENT's HIVE that has to be quiet, not the reader's.** A person
 * in three HIVEs is in one meeting; mail about the other two still means
 * something and still arrives. Every caller already knows which HIVE the thing
 * lives in, so this asks for exactly what they already hold.
 *
 * **Held mail is dropped, not delayed.** It happened in the room the reader was
 * in. An email an hour later saying somebody spoke during the meeting is worse
 * noise than no email at all — and the thing itself is still sitting in the
 * app, where they were.
 *
 * "In its meeting" means a scheduled meeting on that HIVE's calendar whose
 * start and end straddle right now, read in America/Los_Angeles, the same
 * timezone `check-in-reminder` resolves its days in. A meeting with no
 * `end_time` is given two hours, which is what every HIVE's meeting has been
 * since the default landed on 2026-08-25.
 */
const PACIFIC_TZ = 'America/Los_Angeles';

export async function hiveIsMeetingNow(
  admin: { from: (t: string) => any },
  communityId: string | null | undefined,
): Promise<boolean> {
  if (!communityId) return false;

  // Right now, as that HIVE reads a clock: its own calendar date, and minutes
  // since midnight. Comparing in one timezone's own terms keeps this free of
  // the offset arithmetic that daylight saving quietly breaks twice a year.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const minutesNow = Number(parts.hour) * 60 + Number(parts.minute);

  const { data, error } = await admin
    .from('events')
    .select('event_time, end_time')
    .eq('community_id', communityId)
    .eq('event_date', today)
    .eq('event_type', 'meeting')
    .eq('status', 'scheduled');
  // A question we cannot answer must not silence the mail — failing quiet here
  // would drop letters every time the query hiccuped, and nobody would know.
  if (error || !data?.length) return false;

  const minutes = (value: unknown): number | null => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };

  return data.some((row: Record<string, unknown>) => {
    const start = minutes(row.event_time);
    if (start === null) return false;
    const end = minutes(row.end_time) ?? start + 120;
    return minutesNow >= start && minutesNow < end;
  });
}

/**
 * The letter itself: the HIVE's own mark and colour, what was said, and one
 * button that lands on the thing rather than near it.
 *
 * Inline styles throughout, because email clients throw stylesheets away.
 */
export function reachEmailHtml(opts: {
  toName: string;
  hiveName: string;
  hiveSlug?: string | null;
  hiveAccent?: string | null;
  /**
   * WHICH HIVE this letter is about — required, and not for decoration.
   *
   * `sendReachEmail` asks it whether that HIVE is mid-meeting and holds the
   * letter if it is (see `hiveIsMeetingNow`). Null says "no single HIVE", which
   * is honest for HIVE-Wide mail and has no meeting to be quiet for.
   *
   * It sits in the letter rather than being worked out here because only the
   * caller knows whose HIVE the thing belongs to — the reader may be in three.
   * `scripts/lint-reach-mail.mjs` fails the build if any call site leaves it
   * off, since nothing else would notice: these functions run on Deno and
   * `tsconfig.json` excludes them from `tsc`.
   */
  hiveId: string | null;
  /**
   * "Somebody tagged you". The whole letter, really — the kicker above it says
   * HIVE and the line below says what to do.
   */
  heading: string;
  /**
   * The one line under the heading.
   *
   * There used to be a `where` between these two — "In your messages", "Your
   * meeting is tomorrow" — and once the letters went generic on 2026-09-04 it
   * had nothing left to say. Nat read the result: a seal, then HIVE, then
   * "You have a meeting tomorrow", then "Your meeting is tomorrow". The same
   * sentence twice, and a third line under a kicker and a heading, which is
   * two rules broken by one leftover slot. So the slot is gone rather than
   * filled more carefully.
   */
  said: string;
  buttonLabel: string;
  href: string;
}): string {
  const mark = hiveMark(opts.hiveSlug, opts.hiveAccent);
  const name = escapeHtml((opts.toName || '').split(/\s+/)[0] || 'there');
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      <div style="text-align: center; padding: 8px 0 4px;">${hiveSealImg(mark)}</div>
      <p style="text-align: center; color: ${mark.accent}; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${escapeHtml(opts.hiveName)}</p>
      <h1 style="color: ${mark.accent}; font-size: 21px; text-align: center; margin: 8px 0 18px;">${escapeHtml(opts.heading)}</h1>
      <p style="font-size: 15px;">Hi ${name},</p>
      <div style="border-left: 3px solid ${mark.accent}; padding: 4px 0 4px 14px; margin: 14px 0; color: #4a4a4a; font-size: 15px; font-style: italic;">
        ${escapeHtml(opts.said)}
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(opts.href)}" target="_top" style="background: ${mark.accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">${escapeHtml(opts.buttonLabel)}</a>
      </div>
      <p style="font-size: 12px; color: #b6b6b6; text-align: center;">Every one of these has its own switch in Settings. 🍯</p>
    </div>
  `;
}

/**
 * Send it, if their switch is on.
 *
 * Returns what happened rather than throwing: a notification that fails to
 * become an email must never take down the in-app row or the push beside it.
 */
export async function sendReachEmail(
  admin: { from: (t: string) => any },
  userId: string,
  kind: Reach,
  letter: Omit<Parameters<typeof reachEmailHtml>[0], 'toName'> & { subject: string },
): Promise<{ sent: boolean; reason?: string }> {
  if (!(await templateIsApproved(admin, kind))) return { sent: false, reason: 'template not approved' };
  if (kind === 'checkIn' && !letter.hiveId) return { sent: false, reason: 'No meeting HIVE' };
  // Refuse altered prose even when a caller passes a hand-built letter.
  const expected = genericLetter(kind, { buttonLabel: TEMPLATE_BUTTONS[kind], href: letter.href, hiveId: letter.hiveId });
  if (letter.subject !== expected.subject || letter.heading !== expected.heading || letter.said !== expected.said || letter.buttonLabel !== expected.buttonLabel || letter.hiveName !== expected.hiveName) {
    return { sent: false, reason: 'template words changed' };
  }
  let scoped;
  try { scoped = await scopeLetter(admin, letter); }
  catch { return { sent: false, reason: 'unknown email scope' }; }
  return sendReachHtml(admin, userId, kind, {
    hiveId: letter.hiveId,
    subject: scoped.subject,
    // The reader's own name is only known after their switch has been read, so
    // the letter is built inside the door rather than handed to it.
    html: (toName) => reachEmailHtml({ ...scoped, toName }),
  });
}

/**
 * THE DOOR ITSELF, for a letter that is not the short standard one.
 *
 * Everything above builds the same small card — somebody spoke to you, here is
 * what they said, here is the button. The Buzz cannot: it is the whole letter,
 * written by hand, and the words ARE the point. Nat, 2026-09-04, choosing full
 * text over a teaser: her list is small and warm, and it is the one thing she
 * writes by hand all month.
 *
 * So the shape is separated from the rules. A caller with its own HTML still
 * passes through the same four: the member's switch, the meeting quiet hour,
 * one `to:` each so nobody's inbox meets anybody else's, and a plain-text half
 * because Gmail distrusts an HTML-only message.
 *
 * `html` is a function rather than a string so a letter can greet somebody by
 * name — the name is only known once the switch has been read, and reading it
 * twice would double the queries for an @everyone.
 */
async function sendReachHtml(
  admin: { from: (t: string) => any },
  userId: string,
  kind: Reach,
  letter: {
    hiveId: string | null;
    subject: string;
    html: string | ((toName: string) => string);
  },
): Promise<{ sent: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { sent: false, reason: 'no RESEND_API_KEY' };
  // The HIVE this is about is in its meeting: everybody is already in the room.
  if (await hiveIsMeetingNow(admin, letter.hiveId)) {
    return { sent: false, reason: 'that HIVE is meeting' };
  }
  const who = await mayReach(admin, userId, kind);
  if (!who.allowed || !who.email) return { sent: false, reason: 'switched off, or no address' };
  const html = typeof letter.html === 'function' ? letter.html(who.name) : letter.html;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      // One `to:` each. Nobody is ever CC'd beside anybody.
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: who.email,
        subject: letter.subject,
        html,
        text: plainTextFrom(html),
      }),
    });
    if (!res.ok) {
      console.error('[reachMail] send failed:', await res.text());
      return { sent: false, reason: 'provider refused' };
    }
    return { sent: true };
  } catch (error) {
    console.error('[reachMail] send threw:', error);
    return { sent: false, reason: 'threw' };
  }
}

/** Where a link should land, so the button opens the thing and not the app. */
export function deepLink(path: string, communityId?: string | null): string {
  const base = `${APP_URL}${path}`;
  if (!communityId) return base;
  return `${base}${path.includes('?') ? '&' : '?'}hive=${encodeURIComponent(communityId)}`;
}

/**
 * The same letter to several people, one `to:` each.
 *
 * Nobody is ever CC'd beside anybody — a board-wide mention must not introduce
 * everyone's inbox to everyone else's. Each address is looked up server-side
 * inside `sendReachEmail` and never leaves it.
 *
 * Failures are counted, never thrown: an @everyone that reaches nine people
 * and trips on the tenth has still reached nine.
 */
export async function sendReachEmails(
  admin: { from: (t: string) => any },
  userIds: string[],
  kind: Reach,
  letter: Omit<Parameters<typeof reachEmailHtml>[0], 'toName'> & { subject: string },
): Promise<number> {
  const results = await Promise.all(
    userIds.map((userId) => sendReachEmail(admin, userId, kind, letter)),
  );
  return results.filter((result) => result.sent).length;
}

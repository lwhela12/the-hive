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

import { hiveMark } from './hiveMark.ts';

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
} as const;

export type Reach = keyof typeof REACH_COLUMNS;

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
    .select('email, name, email_mention_enabled, email_message_enabled, email_board_reply_enabled')
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
  /** "Brietta mentioned you on Things We Learned" */
  heading: string;
  /** The line under it: which board, which room, whose wish. */
  where: string;
  /** What they actually wrote. */
  said: string;
  buttonLabel: string;
  href: string;
}): string {
  const mark = hiveMark(opts.hiveSlug, opts.hiveAccent);
  const name = escapeHtml((opts.toName || '').split(/\s+/)[0] || 'there');
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      <div style="text-align: center; padding: 8px 0 4px;"><span style="font-size: 40px;">${mark.emoji}</span></div>
      <p style="text-align: center; color: ${mark.accent}; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${escapeHtml(opts.hiveName)}</p>
      <h1 style="color: ${mark.accent}; font-size: 21px; text-align: center; margin: 8px 0 4px;">${escapeHtml(opts.heading)}</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${escapeHtml(opts.where)}</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <div style="border-left: 3px solid ${mark.accent}; padding: 4px 0 4px 14px; margin: 14px 0; color: #4a4a4a; font-size: 15px; font-style: italic;">
        ${escapeHtml(opts.said)}
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${opts.href}" style="background: ${mark.accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">${escapeHtml(opts.buttonLabel)}</a>
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
  if (!RESEND_API_KEY) return { sent: false, reason: 'no RESEND_API_KEY' };
  const who = await mayReach(admin, userId, kind);
  if (!who.allowed || !who.email) return { sent: false, reason: 'switched off, or no address' };
  const html = reachEmailHtml({ ...letter, toName: who.name });
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

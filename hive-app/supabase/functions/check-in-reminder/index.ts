import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import {
  MONTHLY_CHECK_IN_PATTERN,
  QUARTERLY_CHECK_IN_PATTERN,
  END_OF_YEAR_CHECK_IN_PATTERN,
  PRE_MEETING_CHECK_IN_PATTERN,
  END_OF_MONTH_CHECK_IN_PATTERN,
} from '../_shared/checkInPatterns.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';
/** Where the real logo is served from — the same file the invite and The Buzz use. */
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://the-hive.app';

/**
 * Nobody hears from this cron until Nat has read the email herself.
 *
 * Nat, 2026-08-16: *"we said i should get the preview first? always? for all
 * surveys? they should always get emailed to me first & then once I approve
 * them, then we can send them out to everyone, right?"* Right. Every touch this
 * function fires — monthly, day-of, halfway, quarterly, end-of-year, and both of
 * Production's — now goes to this address first and waits.
 *
 * It waits in her inbox and nowhere else. Nat, 2026-08-17: *"it shouldn't live
 * in admin. It should send me a preview email and then once I approve it then
 * you can send it out."* So the preview IS the interface — she reads it, says
 * go, and the send is fired for her. No live link in the email either: a
 * one-click "send to everyone" web address is a members-wide blast that a mail
 * scanner or a forward can trip on its own.
 */
const PREVIEW_EMAIL = Deno.env.get('CHECK_IN_PREVIEW_EMAIL') || 'natwalstead@gmail.com';

/**
 * The real logo, not the bee emoji standing in for it.
 *
 * Nat, 2026-08-16, looking at the OG check-in: *"I'd like it to be a little
 * more branded, like get rid of the bee emoji & use one of our logos."* Same
 * file the invite and the newsletter already send, so the three letters look
 * like the same HIVE. It is RGB with no transparency despite its name, hence the
 * white tile underneath; width in the tag as well as the style because Outlook
 * ignores CSS sizing on images; alt text because a good many people read mail
 * with images off.
 */
const LOGO_BLOCK = `
      <div style="text-align: center; padding: 8px 0 4px;">
        <img src="${PUBLIC_SITE_URL}/assets/hive-logo-email.png"
             alt="H.I.V.E. — Human, Insight, Vision, Execution"
             width="72" height="72"
             style="width:72px;height:72px;display:inline-block;border:0;outline:none;text-decoration:none;background:#ffffff;border-radius:36px;" />
      </div>`;

// How a check-in is recognised now lives in ONE file, read by this function and
// by the app (see _shared/checkInPatterns.ts). It used to be written out here
// and again in lib/checkIns.ts with "change one, change both" on both copies.
//
// A HIVE that holds no matching active survey hears nothing at all from this
// cron. That is the property that made it safe to leave running (verified
// 2026-08-11) and it must stay.
const REMINDER_WINDOW_DAYS = 3;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Survey {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  is_active: boolean;
}

interface MemberProfile {
  id: string;
  name: string | null;
  email: string | null;
  push_token: string | null;
  email_reminders_enabled?: boolean | null;
  email_midpoint_checkin_enabled?: boolean | null;
  email_meeting_checkin_enabled?: boolean | null;
}

// Copied from meeting-reminder/index.ts — sends an Expo push notification.
async function sendExpoPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: pushToken,
      title,
      body,
      sound: 'default',
      badge: 1,
      data: data || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Expo push failed: ${errorText}`);
  }

  return response.json();
}

// IMPORTANT — all 3-days-before math is done in America/Los_Angeles, NOT UTC.
// due_date is stored as midnight UTC (e.g. 2026-07-16T00:00:00Z), which is
// actually 5pm Pacific on July 15 — the REAL meeting day. Subtracting 3 days in
// UTC would yield July 13, but the correct "3 days before the July 15 meeting"
// is July 12. So we render every instant as a Pacific calendar date first, then
// do plain calendar subtraction. The cron runs at 16:00 UTC (~9am Pacific), so
// "today in Pacific" evaluated at that moment is the right calendar day.
// DO NOT change this back to UTC.
const PACIFIC_TZ = 'America/Los_Angeles';

// Render a Date instant as an America/Los_Angeles calendar date 'YYYY-MM-DD'.
// (en-CA locale formats as YYYY-MM-DD.)
function toPacificDateOnly(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Response period marker, mirrors app's getSurveyResponsePeriod: 'YYYY-MM'.
// Derived from the Pacific meeting date so it lands in the meeting's month.
function getSurveyResponsePeriod(dueDateOnly: string): string {
  return dueDateOnly.slice(0, 7); // 'YYYY-MM'
}

// The reminder window opens (meeting date - 3 days). Pure calendar subtraction
// on an already-Pacific calendar date, so no timezone is involved here.
function addDaysToDateOnly(dueDateOnly: string, days: number): string {
  const [y, m, d] = dueDateOnly.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function getWindowOpenDate(dueDateOnly: string): string {
  return addDaysToDateOnly(dueDateOnly, -REMINDER_WINDOW_DAYS);
}

// The upcoming quarter/year end as a Pacific calendar date, for previews.
// Q4 deliberately rolls to Q1 of the new year: December's quarter-end belongs
// to the end-of-year check-in, so there is no Q4 quarterly (see lib/checkIns.ts).
function upcomingSeasonEndDateOnly(kind: SeasonKind, todayDateOnly: string): string {
  const [y, m] = todayDateOnly.split('-').map(Number);
  if (kind === 'year') return `${y}-12-31`;
  let quarter = Math.floor((m - 1) / 3) + 1;
  let year = y;
  if (quarter === 4) {
    quarter = 1;
    year += 1;
  }
  const endMonth = quarter * 3;
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
}

// Three touches per cycle, all fired by the same daily cron:
//   midpoint — 3rd-to-last day of the month: the newsletter check-in
//   window   — 3 days before: the full check-in invitation (legacy behavior)
//   day_of   — meeting day: last call, only to people not yet checked in
//
// The midpoint touch is pinned to the CALENDAR, not to the meeting. Meetings
// are usually the 2nd Wednesday but bounce around with availability, and the
// newsletter goes out on the 1st regardless — so "14 days before whenever the
// meeting lands" was a moving target nobody could plan around. Month-end is
// predictable AND still roughly halfway between meetings (Nat 2026-07-25).
type ReminderKind = 'window' | 'day_of' | 'midpoint';
const NEWSLETTER_LEAD_DAYS = 3;

// The 3rd-to-last day of the month the given Pacific date falls in, so members
// get the last 3 days to add something before the 1st.
function newsletterCheckInDate(todayDateOnly: string): string {
  const [year, month] = todayDateOnly.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = daysInMonth - (NEWSLETTER_LEAD_DAYS - 1);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Format a 'YYYY-MM-DD' date as e.g. "August 15" for email/body copy.
function formatMeetingDate(dueDateOnly: string): { month: string; day: number } {
  const [, m, d] = dueDateOnly.split('-').map(Number);
  return { month: MONTH_NAMES[m - 1] ?? '', day: d };
}

// A name is a name, never markup. Found 2026-08-03: the preview dropped whatever
// name the caller typed straight into the email, so a name could carry a link or
// a button and arrive looking like the HIVE had sent it. Names go through here on
// the way into any email, including real members' — nobody should be able to
// style their way into somebody else's inbox.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * What tonight actually is, read off the meeting itself.
 *
 * The August last call went out saying "meeting August 19" because the email
 * took its date from the check-in's due date, and that had been left on the
 * old night after the meeting moved to the 20th. The calendar entry was right
 * the whole time. So the day-of email now reads the meeting row — its weekday,
 * its start time, where it is, and whatever Nat wrote on it — and the check-in
 * due date only decides WHEN to send, never what the email claims.
 *
 * `note` is the event's own description, so the words in the email and the
 * words on the meeting in the app are the same words, written once.
 */
interface MeetingDetails {
  weekday: string;
  dateLabel: string;
  timeLabel: string | null;
  location: string | null;
  note: string | null;
}

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// The weekday of a plain 'YYYY-MM-DD', with no timezone in the way — the date
// is already a Pacific calendar date by the time it reaches here.
function weekdayOf(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

// '17:30:00' -> '5:30 PM'. Mirrors the app's formatTime so the email and the
// Meetings screen say the hour the same way.
function formatClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const [rawH, rawM] = value.split(':');
  const h = Number(rawH);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${rawM ?? '00'} ${suffix}`;
}

async function loadMeetingDetails(
  admin: ReturnType<typeof createClient>,
  communityId: string,
  dateOnly: string,
): Promise<MeetingDetails> {
  const [, m, d] = dateOnly.split('-').map(Number);
  const fallback: MeetingDetails = {
    weekday: weekdayOf(dateOnly),
    dateLabel: `${MONTH_NAMES[m - 1] ?? ''} ${d}`,
    timeLabel: null,
    location: null,
    note: null,
  };
  try {
    const { data } = await admin
      .from('events')
      .select('event_time, location, description')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .eq('event_date', dateOnly)
      .limit(1);
    const row = data?.[0] as
      | { event_time: string | null; location: string | null; description: string | null }
      | undefined;
    if (!row) return fallback;
    return {
      ...fallback,
      timeLabel: formatClock(row.event_time),
      location: row.location?.trim() || null,
      note: row.description?.trim() || null,
    };
  } catch (err) {
    // A missing meeting row is not a reason to skip the last call — the email
    // just goes out with the plain date it always had.
    console.error('[check-in-reminder] could not read the meeting row:', err);
    return fallback;
  }
}

/**
 * Nat's note, rendered so it can be read at a glance.
 *
 * Nat, 2026-08-20: *"can you make it look prettier? I like it when I can see
 * things at a glance ... if we can do an emoji or a bold or an underline or
 * something for Tonight, Joining remotely, August HIVE Help and Welcome, and
 * Page to Screen."* A wall of even paragraphs makes somebody read all of it to
 * find the one line they needed, and on a phone, at work, that means they read
 * none of it.
 *
 * ONE RULE, so the note stays plain text she can edit anywhere: blank lines
 * separate blocks, and **the first line of a block is its heading** when more
 * lines follow it. A block that is a single line is just a line. That reads
 * correctly on the meeting in the app too — heading, then the words under it —
 * so nothing here is markup she has to remember.
 */
function noteHtml(note: string): string {
  return note
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      // A lone line carries itself — no heading to separate it from.
      if (lines.length === 1) {
        return `<p style="font-size: 15px; line-height: 1.55; margin: 0 0 16px;">${escapeHtml(lines[0])}</p>`;
      }
      const [heading, ...rest] = lines;
      return `
      <div style="margin: 0 0 18px;">
        <p style="font-size: 15px; font-weight: 700; color: #8a6b30; margin: 0 0 4px;">${escapeHtml(heading)}</p>
        <p style="font-size: 15px; line-height: 1.55; margin: 0;">${rest.map((line) => escapeHtml(line)).join('<br />')}</p>
      </div>`;
    })
    .join('');
}

// Warm honey/gold check-in email — shared by the real send and the test preview.
function checkInEmailHtml(
  rawName: string,
  month: string,
  day: number,
  kind: ReminderKind = 'window',
  /**
   * Whose check-in this is, said on the pill under the logo. Nat, 2026-08-16:
   * *"the Pill should say 'OG HIVE' (not just HIVE, because there are multiples
   * now)"* — the same reason the season emails grew a kicker the day before.
   */
  rawHiveName = 'Your HIVE',
  /**
   * The HIVE the tune-up belongs to, carried on the button.
   *
   * Without it the link says only `/monthly-tuneup`, and everybody's app
   * remembers HIVE-Wide — where no HIVE's rhythm exists, so the screen honestly
   * answers "coming soon" and the check-in is unreachable. Nat, 2026-08-16:
   * *"looks like it's not even working right now, which is weird, because it's
   * just the regular OG HIVE pre meeting checkin, which has been working for
   * months."* It had been; HIVE-Wide is what changed underneath it. Same fix
   * the season email got on 2026-08-15 — a link that names a HIVE is a request
   * to be IN that HIVE.
   */
  communityId?: string,
  /**
   * Tonight, as the meeting itself describes it — read off the event row, so
   * the email cannot drift from the calendar the way August's did.
   */
  meeting?: MeetingDetails,
): string {
  // Escaped once, here, so every path out of this function is safe by default.
  const name = escapeHtml(rawName);
  const hive = escapeHtml(rawHiveName);
  const kicker = `<p style="text-align: center; color: #bd9348; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>`;
  const tuneupHref = (mode?: string) => {
    const params = [
      ...(communityId ? [`hive=${encodeURIComponent(communityId)}`] : []),
      ...(mode ? [`mode=${mode}`] : []),
    ];
    return `${APP_URL}/monthly-tuneup${params.length ? `?${params.join('&')}` : ''}`;
  };
  if (kind === 'day_of') {
    // Everything above the check-in ask comes off the meeting row: the weekday
    // and date, the hour it starts, where it is, and Nat's own note. The email
    // used to assert the date from the check-in's due date and got it wrong in
    // August, so it no longer says anything the calendar has not said first.
    const when = meeting
      ? `${meeting.weekday}, ${meeting.dateLabel}`
      : `${month} ${day}`;
    const whenLine = meeting?.timeLabel
      ? `${when} · from ${meeting.timeLabel}`
      : when;
    const note = meeting?.note ? noteHtml(meeting.note) : '';
    const where = meeting?.location
      ? `<p style="font-size: 15px; color: #6b6b6b; margin: 0 0 18px;">📍 ${escapeHtml(meeting.location)}</p>`
      : '';
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      ${LOGO_BLOCK}
      ${kicker}
      <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">Meeting tonight!</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${escapeHtml(whenLine)}</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      ${note}
      ${where}
      <div style="height: 1px; background: #f0e3c8; margin: 4px 0 20px;"></div>
      <p style="font-size: 15px; font-weight: 700; color: #8a6b30; margin: 0 0 4px;">✅ Your check-in isn't in yet</p>
      <p style="font-size: 15px; line-height: 1.55; margin: 0;">It takes about <strong>2 minutes</strong> with the Looks good → buttons, and it lights you up on the Arrival Board.</p>
      <div style="text-align: center; margin: 24px 0 28px;">
        <a href="${tuneupHref()}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Check in before tonight</a>
      </div>
      <p style="font-size: 14px; color: #6b6b6b;"><strong>Can't make it tonight?</strong> No worries — HIVE will email you two quick ways to catch up afterward: open the meeting summary or ask Clive what you missed. If you don't want recap emails, turn off <strong>Recap email if I miss a meeting</strong> in Profile → Settings.</p>
      <p style="font-size: 13px; color: #9a9a9a; text-align: center;">See you tonight. 🍯</p>
    </div>
  `;
  }
  if (kind === 'midpoint') {
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      ${LOGO_BLOCK}
      ${kicker}
      <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">Halfway check-in</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">The newsletter goes out on the 1st</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">No meeting tonight — but the newsletter goes out soon, and this is the easy way in:</p>
      <ul style="font-size: 15px; padding-left: 20px;">
        <li>Want a <strong>shout-out, a plug, or a reminder</strong> in the newsletter? Say so and it lands there</li>
        <li>Check off anything you've finished on your <strong>to-do list</strong></li>
        <li>Life moved? Update your HD wish</li>
      </ul>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${tuneupHref('midpoint')}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Take the 2-minute check-in</a>
      </div>
    </div>
  `;
  }
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      ${LOGO_BLOCK}
      ${kicker}
      <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">Your check-in is open</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">Before the ${month} ${day} meeting</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">The monthly check-in for the <strong>${month} meeting</strong> is open — one walkthrough, about <strong>5 minutes</strong>:</p>
      <ul style="font-size: 15px; padding-left: 20px;">
        <li>Your HD wishes — anything change? Anyone help?</li>
        <li>Hang ideas &amp; the calendar (out of town? add the stretch!)</li>
        <li>A few quick questions: your name-for-today, energy, and POP</li>
      </ul>
      <p style="font-size: 15px;">Each step has a <strong>Looks good →</strong> button, so if nothing's new you can breeze through in under a minute. Checking in shows up on the Arrival Board and helps set the room before we gather.</p>
      <p style="font-size: 14px; color: #8a6b30; background: #fdf3dc; border-radius: 12px; padding: 10px 14px;">Already done your check-in this month? You're all set — feel free to skip this, or pop in any time to update your answers.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${tuneupHref()}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Open H.I.V.E. and check in</a>
      </div>
      <p style="font-size: 14px; color: #6b6b6b;"><strong>Can't make the meeting?</strong> No worries — after Wrap-Up, HIVE can email you two direct ways to catch up: open the meeting summary or ask Clive what you missed. If you don't want recap emails, turn off <strong>Recap email if I miss a meeting</strong> in Profile → Settings.</p>
      <p style="font-size: 13px; color: #9a9a9a; text-align: center;">See you at the ${month} meeting. 🍯</p>
    </div>
  `;
}

/**
 * The quarter and the year get their own emails — same honey/gold dress as
 * the monthly ones, different words. A quarter is a look back; a year is a
 * small celebration. Both land on Home, where the check-in card lives.
 */
type SeasonKind = 'quarter' | 'year' | 'premeeting' | 'endofmonth';
type SeasonTouch = 'window' | 'day_of';

function seasonEmailHtml(
  rawName: string,
  kind: SeasonKind,
  touch: SeasonTouch,
  month: string,
  day: number,
  rawHiveName: string,
  /** The check-in this email is about, so its button can open it directly. */
  surveyId?: string,
  communityId?: string,
  /**
   * A line at the very bottom that is different every time this email goes out.
   *
   * Nat, 2026-08-15, on the fourth preview: *"look, no button?"* The button was
   * there — checked the sent message itself, not the code that writes it — and
   * Gmail had folded it behind a "..." because four emails in one thread ended
   * with identical content, which is exactly what Gmail treats as quoted text
   * and hides.
   *
   * A member gets one of these, so they would have seen it. But "Before we
   * meet" arrives every month with the same closing lines, and the one thing
   * that must never be hidden is the way in. Giving the tail something that
   * changes keeps the button clear of Gmail's trimming, and tells the reader
   * something worth knowing while it is at it.
   */
  footerNote?: string,
): string {
  const name = escapeHtml(rawName);
  // Whose HIVE this is, said in the email itself and on the button. Nat,
  // 2026-08-15: *"I think it should have either the hive honeybee or a pro
  // hive before we meet ... I think it's just open pro hive."*
  const hive = escapeHtml(rawHiveName);
  const kicker = `<p style="text-align: center; color: #6b4a8f; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>`;
  // The button lands ON the check-in, not near it. Nat, 2026-08-15: *"when I
  // clicked on the survey button in the mail, it just brought me into HIVE, it
  // didn't bring me directly into the survey ... if you leave instructions
  // 'it's in home' and then the link drops them HIVE-Wide and then they have to
  // navigate to the correct spot on the correct page in the correct HIVE? We
  // might lose them."* The HIVE id rides along so the link works from anywhere,
  // including HIVE-Wide and including somebody who is in three HIVEs.
  const openHref = surveyId && communityId
    ? `${APP_URL}/hive?openSurveyId=${encodeURIComponent(surveyId)}&hive=${encodeURIComponent(communityId)}`
    : `${APP_URL}/hive`;
  const openButton = `<a href="${openHref}" style="background: #6b4a8f; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Open the check-in</a>`;
  if (kind === 'endofmonth') {
    const heading = touch === 'day_of' ? 'Last day of the month' : 'Halfway there';
    const body = touch === 'day_of'
      ? `It's the last day of the month. Nothing owed — just a quick one if you want a hand with anything, or you have something for the newsletter.`
      : `A gentle one, halfway through. How is it going, is there anything you want a hand with, and have you got anything for the newsletter — a shout-out, a compliment, something you're teaching. Blanks are completely fine, and whatever is still on your list is on your to-do list in the app.`;
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
        <div style="text-align: center; padding: 8px 0 4px;"><span style="font-size: 40px;">🎬</span></div>
        ${kicker}
        <h1 style="color: #6b4a8f; font-size: 22px; text-align: center; margin: 8px 0 4px;">${heading}</h1>
        <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">The month ends ${month} ${day}</p>
        <p style="font-size: 15px;">Hi ${name},</p>
        <p style="font-size: 15px;">${body}</p>
        <div style="text-align: center; margin: 28px 0;">
          ${openButton}
        </div>
        <p style="font-size: 13px; color: #9a9a9a; text-align: center;">Every answer stays inside your HIVE. 🍯</p>
        ${footerNote ? `<p style="font-size: 12px; color: #b6b6b6; text-align: center; margin-top: 2px;">${footerNote}</p>` : ''}
      </div>
    `;
  }
  if (kind === 'premeeting') {
    const heading = touch === 'day_of' ? "It's today" : 'Before we meet';
    const body = touch === 'day_of'
      ? `We meet today and your answers aren't in yet — it takes about <strong>3 minutes</strong>, and it means we can spend the hour deciding together instead of asking each other questions.`
      : `Our check-in is open — about <strong>3 minutes</strong>. How often you want to meet, what day works, how you feel about a Honey Pot, and who is allowed to know you are part of this. Answering beforehand means the meeting gets to decide. Short answers are perfect.`;
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
        <div style="text-align: center; padding: 8px 0 4px;"><span style="font-size: 40px;">🎬</span></div>
        ${kicker}
        <h1 style="color: #6b4a8f; font-size: 22px; text-align: center; margin: 8px 0 4px;">${heading}</h1>
        <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${month} ${day}</p>
        <p style="font-size: 15px;">Hi ${name},</p>
        <p style="font-size: 15px;">${body}</p>
        <div style="text-align: center; margin: 28px 0;">
          ${openButton}
        </div>
        <p style="font-size: 13px; color: #9a9a9a; text-align: center;">Every answer stays inside your HIVE. 🍯</p>
        ${footerNote ? `<p style="font-size: 12px; color: #b6b6b6; text-align: center; margin-top: 2px;">${footerNote}</p>` : ''}
      </div>
    `;
  }
  const heading = kind === 'quarter'
    ? (touch === 'day_of' ? 'Last day of the quarter' : "The quarter's wrapping up")
    : (touch === 'day_of' ? 'Last day of the year!' : 'One more look at the year');
  const sub = kind === 'quarter'
    ? `The quarter ends ${month} ${day}`
    : `The year ends ${month} ${day}`;
  const emoji = kind === 'quarter' ? '🧭' : '🎉';
  const body = kind === 'quarter'
    ? (touch === 'day_of'
        ? `Today's the last day of the quarter and your check-in isn't in yet — it takes about <strong>5 minutes</strong>, and it's a lovely way to close the chapter before the next one starts.`
        : `Three months went by fast. Your <strong>quarterly check-in</strong> is open on Home — five quiet minutes to look back at what happened, what you're proud of, and what you want from the next stretch. Short answers are perfect.`)
    : (touch === 'day_of'
        ? `It's the very last day of the year and your check-in isn't in yet — five minutes, one look back, and you get to walk into the new year with the whole story written down.`
        : `The year is wrapping up. Your <strong>end-of-year check-in</strong> is open on Home — look back with us, celebrate a little, and point at what comes next. Short answers are perfect.`);
  const button = kind === 'quarter' ? `Open ${hive} and look back` : `Open ${hive} and wrap the year`;
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      <div style="text-align: center; padding: 8px 0 4px;">
        <span style="font-size: 40px;">${emoji}</span>
      </div>
      <p style="text-align: center; color: #bd9348; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>
      <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">${heading}</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${sub}</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">${body}</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${openHref}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">${button}</a>
      </div>
      <p style="font-size: 13px; color: #9a9a9a; text-align: center;">Every answer stays inside your HIVE. 🍯</p>
        ${footerNote ? `<p style="font-size: 12px; color: #b6b6b6; text-align: center; margin-top: 2px;">${footerNote}</p>` : ''}
    </div>
  `;
}

/**
 * Every subject line says which HIVE it is from, first.
 *
 * Nat, 2026-08-15, opening one on her phone: *"there's nothing branded here
 * that lets you know that it's for the hive right off the bat ... I think it
 * needs to stay like, hive or pro hive, your check-in is open."* A person in
 * three HIVEs gets these from all three, and an inbox shows the subject and
 * nothing else.
 *
 * The `endofmonth` branch of this function used to be a copy of the email's
 * HTML — a whole document returned as a subject line, referring to a `name`
 * variable this function has never had. It would have thrown on 28 August, the
 * first time Production's end-of-month check-in came due.
 */
/**
 * Subject lines get the SHORT name and the short month. Nat, 2026-08-15:
 * *"I like that title, I think shorten it to Pro HIVE otherwise it's super
 * long ... and maybe Aug 18."* A phone shows perhaps forty characters of a
 * subject, and "Production HIVE · Before we meet on August 18 — your check-in
 * is open" spends a quarter of them before it says anything.
 *
 * The email itself keeps the full name; only the subject is squeezed.
 */
function shortHiveName(hiveName: string): string {
  return hiveName.replace(/^Production HIVE$/i, 'Pro HIVE');
}

const SHORT_MONTHS: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
  May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
  September: 'Sept', October: 'Oct', November: 'Nov', December: 'Dec',
};

function seasonSubject(
  kind: SeasonKind,
  touch: SeasonTouch,
  fullMonth: string,
  day: number,
  hiveName: string,
): string {
  const from = `${shortHiveName(hiveName)} · `;
  const month = SHORT_MONTHS[fullMonth] ?? fullMonth;
  if (kind === 'premeeting') {
    return touch === 'day_of'
      ? `🎬 ${from}We meet today — 3 minutes before we do`
      : `🎬 ${from}Before we meet on ${month} ${day} — your check-in is open`;
  }
  if (kind === 'endofmonth') {
    return touch === 'day_of'
      ? `🎬 ${from}Last day of the month — anything for the newsletter?`
      : `🎬 ${from}Halfway check-in — no obligations`;
  }
  if (kind === 'quarter') {
    return touch === 'day_of'
      ? `🧭 ${from}Last day of the quarter — quick check-in if you haven't`
      : `🧭 ${from}The quarter wraps up ${month} ${day} — your check-in is open`;
  }
  return touch === 'day_of'
    ? `🎉 ${from}Last day of the year — one look back before it goes`
    : `🎉 ${from}One more look at the year — your end-of-year check-in is open`;
}

/* -------------------------------------------------------------------------- *
 * The hold: nothing reaches a member until Nat has read it and said go.
 *
 * Every touch this cron fires now stops one step short. It renders the exact
 * email a member would get, sends that one copy to `PREVIEW_EMAIL` with a band
 * across the top saying who it is for and how many people, and writes a
 * `notifications` row that is BOTH the receipt (so tomorrow's run does not
 * preview the same thing again) and the thing Admin lists as waiting.
 *
 * Approving replays the touch from that row rather than recomputing it from
 * today's date — otherwise approving the morning after would find no touch due
 * and send nothing, silently, which is the worst possible way for this to fail.
 * ------------------------------------------------------------------------- */

/** Which of the two loops a held touch came from, so approval replays the right one. */
type CheckInFamily = 'monthly' | 'season';

type HeldTouch = {
  family: CheckInFamily;
  /** `window` | `day_of` | `midpoint` for monthly; the SeasonKind for season. */
  kind: string;
  /** `window` | `day_of` — season only. */
  touch?: string;
  /** The dedup key the real send will write, so approval reuses it exactly. */
  period: string;
  dueDateOnly: string;
  hiveName: string;
  subject: string;
  recipients: number;
};

/** The profile the preview goes to. Fails closed: no Nat, no send to anybody. */
async function findPreviewProfile(
  admin: ReturnType<typeof createClient>,
): Promise<{ id: string; email: string } | null> {
  const { data: byEmail } = await admin
    .from('profiles')
    .select('id, email')
    .ilike('email', PREVIEW_EMAIL)
    .maybeSingle();
  const row = byEmail as { id: string; email: string | null } | null;
  if (row?.id) return { id: row.id, email: row.email ?? PREVIEW_EMAIL };
  // She may sign in under a different address than the one she reads mail at.
  // An owner's profile id still carries the card; the email stays PREVIEW_EMAIL.
  const { data: owners } = await admin
    .from('profiles')
    .select('id')
    .eq('is_owner', true)
    .limit(1);
  const owner = (owners ?? [])[0] as { id: string } | undefined;
  return owner ? { id: owner.id, email: PREVIEW_EMAIL } : null;
}

/** A band across the top of the preview saying what pressing go would do. */
function previewBanner(held: HeldTouch, hiveName: string): string {
  const who = `${escapeHtml(hiveName)} · ${held.recipients} ${held.recipients === 1 ? 'person' : 'people'}`;
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto 18px;">
      <div style="background: #fdf3dc; border: 1px solid #e6d2a4; border-radius: 14px; padding: 14px 16px; color: #6b5220;">
        <p style="margin: 0 0 6px; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700;">Waiting for your go-ahead</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.5;">Nobody has this yet. Below is exactly what <strong>${who}</strong> will get. Say the word and it goes out — if you do nothing, nothing sends.</p>
      </div>
    </div>`;
}

/**
 * Whether this exact touch has already been let through.
 *
 * The approval lives on the preview row's own metadata, so there is one object
 * per held touch and no second table to keep in step.
 */
async function findHold(
  admin: ReturnType<typeof createClient>,
  surveyId: string,
  period: string,
): Promise<{ id: string; approved: boolean } | null> {
  const { data } = await admin
    .from('notifications')
    .select('id, metadata')
    .eq('metadata->>reminder_survey_id', surveyId)
    .eq('metadata->>reminder_period', `${period}:preview`)
    .limit(1);
  const row = (data ?? [])[0] as { id: string; metadata?: Record<string, unknown> } | undefined;
  if (!row) return null;
  return { id: row.id, approved: row.metadata?.check_in_approval === 'approved' };
}

/**
 * Send Nat the preview and park the touch. Returns false when there is nobody
 * to preview to — which stops the send rather than falling back to sending it,
 * because "we could not ask her" must never mean "so we told everyone".
 */
async function holdForApproval(
  admin: ReturnType<typeof createClient>,
  survey: Survey,
  held: HeldTouch,
  memberHtml: string,
): Promise<boolean> {
  const previewTo = await findPreviewProfile(admin);
  if (!previewTo) {
    console.error('[check-in-reminder] no preview profile found — holding without sending');
    return false;
  }

  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: previewTo.email,
          subject: `[Waiting on you] ${held.subject}`,
          html: `${previewBanner(held, held.hiveName)}${memberHtml}`,
        }),
      });
      if (!res.ok) console.error('[check-in-reminder] preview email failed:', await res.text());
    } catch (previewError) {
      console.error('[check-in-reminder] preview email error:', previewError);
    }
  }

  const { error } = await admin.from('notifications').insert({
    user_id: previewTo.id,
    community_id: survey.community_id,
    notification_type: 'general',
    title: `✋ ${held.hiveName} check-in is waiting on you`,
    content: `${held.recipients} ${held.recipients === 1 ? 'person' : 'people'} get "${held.subject}" once you say go. The preview is in your inbox.`,
    email_sent: !!RESEND_API_KEY,
    metadata: {
      reminder_survey_id: survey.id,
      reminder_period: `${held.period}:preview`,
      check_in_approval: 'pending',
      check_in_family: held.family,
      check_in_kind: held.kind,
      check_in_touch: held.touch ?? null,
      check_in_period: held.period,
      check_in_due_date: held.dueDateOnly,
      check_in_community: survey.community_id,
      check_in_hive_name: held.hiveName,
      check_in_subject: held.subject,
      check_in_recipients: held.recipients,
    },
  });
  if (error) console.error('[check-in-reminder] could not park the hold:', error);
  return true;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  // Preview mode: POST { "test_email": "you@example.com" } sends ONE sample email
  // to that address (ignores the date gate + dedup, writes no notifications) so an
  // owner can see the real email before it goes to everyone. Uses the REAL active
  // monthly check-in's meeting date so the preview reads like the real send.
  // The word `null` on its own is perfectly good JSON, so a request whose whole
  // body is that parses happily and hands back nothing at all — and the next
  // line reads a field off that nothing, which throws, and the function falls
  // over with a 500 before it has even asked who is calling. Nobody gets in that
  // way, but a stranger shouldn't be able to make it fall over either. Anything
  // that isn't a plain object is now treated exactly like an empty body, which is
  // what it was always meant to mean (found 2026-08-03).
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch { /* empty body is fine */ }
  const testEmail = typeof body.test_email === 'string' ? body.test_email.trim() : '';
  // A multi-HIVE preview must name the survey it is previewing. Falling back to
  // the first active monthly check-in sent Nat a Tech HIVE September preview
  // when she explicitly asked to inspect OG's August last call (2026-08-18).
  const testSurveyId = typeof body.test_survey_id === 'string'
    ? body.test_survey_id.trim()
    : '';

  // This function had no door on it at all. Found 2026-08-03, unused:
  // anyone who knew the web address could POST a test_email and have a real,
  // HIVE-styled, HIVE-signed email land in any inbox they named — and post
  // force_send to fire the whole member-wide email and push blast on demand.
  // The first is a ready-made way to fish for people using our own good name;
  // if it got used, the mail provider could shut the sending domain down and
  // take invites, check-ins and the newsletter with it.
  //
  // Two ways in now, and only two. The nightly cron calls with the service key,
  // which nothing outside the backend has. Nat and Lucas can still preview and
  // still force a send after a meeting moves — those tools are genuinely useful,
  // they're just theirs.
  //
  // ONE THING TO CHECK BEFORE THIS SHIPS (2026-08-03): migration 107 told
  // whoever set the nightly job up that the anon key would do here, because back
  // then there was nothing to get past. There is now. The pg_cron entry has to
  // carry the service-role key or the nightly run gets refused along with
  // everyone else — quietly, since a cron has nobody to complain to. If the
  // check-in emails go silent, that is the first place to look.
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByCron = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  if (!calledByCron) {
    // The same words whether the caller never signed in or signed in and isn't
    // an owner — a refusal shouldn't teach you what's behind it, or hint that
    // guessing again with a different account is worth the trouble.
    const refusal = 'The check-in reminder runs on its own schedule.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(supabaseAdmin, auth.userId))) return errorResponse(refusal, 403);
  }

  if (testEmail) {
    if (!RESEND_API_KEY) return errorResponse('RESEND_API_KEY not configured', 500);
    // The preview shows the real meeting date, in the email and in the reply
    // below. That used to be readable by anybody who asked; it's only reachable
    // by an owner now, and an owner already knows when the meeting is.
    let month = MONTH_NAMES[new Date().getMonth()];
    let day = new Date().getDate();
    const { data: previewSurveys } = await supabaseAdmin
      .from('surveys')
      .select('id, title, due_date, community_id')
      .eq('is_active', true);
    const previewCheckIn = (previewSurveys ?? []).find(
      (s: { id?: string; title?: string; due_date?: string }) =>
        (!testSurveyId || s.id === testSurveyId)
        && MONTHLY_CHECK_IN_PATTERN.test(s.title || '')
        && s.due_date
    ) as { id?: string; title?: string; due_date?: string; community_id?: string } | undefined;
    if (testSurveyId && !previewCheckIn && !['premeeting', 'endofmonth', 'quarter', 'year'].includes(String(body.test_kind ?? ''))) {
      return errorResponse('That active monthly check-in could not be previewed.', 404);
    }
    // Kept for the day-of preview, which reads the meeting row for that date.
    let previewDateOnly: string | null = null;
    if (previewCheckIn?.due_date) {
      const previewDate = toPacificDateOnly(new Date(previewCheckIn.due_date));
      previewDateOnly = previewDate;
      if (previewDate) ({ month, day } = formatMeetingDate(previewDate));
    }
    // The preview carries the real HIVE, so the pill and the button in it are
    // the ones a member gets — a preview whose link works differently from the
    // real send is how "it's not working" gets missed for months.
    let previewHiveName = 'Your HIVE';
    if (previewCheckIn?.community_id) {
      const { data: previewHive } = await supabaseAdmin
        .from('communities')
        .select('name')
        .eq('id', previewCheckIn.community_id)
        .maybeSingle();
      previewHiveName = (previewHive as { name?: string } | null)?.name || previewHiveName;
    }
    const requestedTestKind = typeof body.test_kind === 'string' ? body.test_kind : 'window';

    // Season previews: test_kind 'quarter' or 'year' sends that sample,
    // dated to the upcoming quarter/year end so it reads like the real one.
    //
    // 'premeeting' and 'endofmonth' preview differently, and had no preview at
    // all until 2026-08-15 — which is how a HIVE's own check-in email could go
    // out with nothing on it saying which HIVE it came from without anybody
    // seeing it first. These two belong to a REAL survey in a REAL HIVE, so
    // rather than inventing a date and calling the sender "Your HIVE", the
    // preview finds that survey and borrows both. What lands in the inbox is
    // then the same email the members will get, down to the name on the button.
    if (requestedTestKind === 'quarter' || requestedTestKind === 'year') {
      const seasonKind = requestedTestKind as SeasonKind;
      const previewToday = toPacificDateOnly(new Date()) ?? new Date().toISOString().slice(0, 10);
      const endDateOnly = upcomingSeasonEndDateOnly(seasonKind, previewToday);
      const { month: seasonMonth, day: seasonDay } = formatMeetingDate(endDateOnly);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: testEmail,
          subject: `[Preview] ${seasonSubject(seasonKind, 'window', seasonMonth, seasonDay, 'Your HIVE')}`,
          html: seasonEmailHtml(
            typeof body.test_name === 'string' ? body.test_name : 'there',
            seasonKind, 'window', seasonMonth, seasonDay, 'Your HIVE',
            undefined, undefined,
            `preview sent ${new Date().toLocaleTimeString('en-US', { timeZone: PACIFIC_TZ, hour: 'numeric', minute: '2-digit' })}`,
          ),
        }),
      });
      if (!res.ok) return errorResponse(`Preview email failed: ${await res.text()}`, 502);
      return jsonResponse({ preview_sent_to: testEmail, kind: seasonKind, ends: `${seasonMonth} ${seasonDay}` });
    }

    if (requestedTestKind === 'premeeting' || requestedTestKind === 'endofmonth') {
      const seasonKind = requestedTestKind as SeasonKind;
      const pattern = seasonKind === 'premeeting'
        ? PRE_MEETING_CHECK_IN_PATTERN
        : END_OF_MONTH_CHECK_IN_PATTERN;
      const { data: candidates } = await supabaseAdmin
        .from('surveys')
        .select('id, title, due_date, community_id')
        .eq('is_active', true);
      const match = (candidates ?? []).find(
        (s: { id?: string; title?: string; due_date?: string }) =>
          (!testSurveyId || s.id === testSurveyId)
          && pattern.test(s.title || '')
          && s.due_date
      ) as { id: string; title: string; due_date: string; community_id: string } | undefined;
      if (!match) {
        return errorResponse(`No active ${seasonKind} check-in to preview.`, 404);
      }
      const dateOnly = toPacificDateOnly(new Date(match.due_date));
      if (!dateOnly) return errorResponse('That check-in has an unreadable due date.', 500);
      const { month: kMonth, day: kDay } = formatMeetingDate(dateOnly);
      const { data: hive } = await supabaseAdmin
        .from('communities')
        .select('name')
        .eq('id', match.community_id)
        .maybeSingle();
      const hiveName = (hive as { name?: string } | null)?.name || 'Your HIVE';
      // 'day_of' is the last-call version; 'window' is the one that goes out
      // three days ahead. Default to the one members actually saw first.
      const touch: SeasonTouch = body.test_touch === 'day_of' ? 'day_of' : 'window';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: testEmail,
          subject: `[Preview] ${seasonSubject(seasonKind, touch, kMonth, kDay, hiveName)}`,
          html: seasonEmailHtml(
            typeof body.test_name === 'string' ? body.test_name : 'there',
            seasonKind, touch, kMonth, kDay, hiveName, match.id, match.community_id,
            `${hiveName} · closes ${kMonth} ${kDay} · preview sent ${new Date().toLocaleTimeString('en-US', { timeZone: PACIFIC_TZ, hour: 'numeric', minute: '2-digit' })}`,
          ),
        }),
      });
      if (!res.ok) return errorResponse(`Preview email failed: ${await res.text()}`, 502);
      return jsonResponse({
        preview_sent_to: testEmail,
        kind: seasonKind,
        touch,
        hive: hiveName,
        survey: match.title,
        dated: `${kMonth} ${kDay}`,
      });
    }

    const testKind: ReminderKind = requestedTestKind === 'midpoint' || requestedTestKind === 'day_of'
      ? requestedTestKind
      : 'window';
    const previewFrom = `${shortHiveName(previewHiveName)} · `;
    const previewSubject = testKind === 'midpoint'
      ? `[Preview] 🍯 ${previewFrom}Halfway check-in — the newsletter goes out on the 1st`
      : testKind === 'day_of'
        ? `[Preview] 🐝 ${previewFrom}Meeting tonight — ${month} ${day}`
        : `[Preview] 🐝 ${previewFrom}Your check-in is open — meeting ${month} ${day}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: testEmail,
        subject: previewSubject,
        html: checkInEmailHtml(
          typeof body.test_name === 'string' ? body.test_name : 'there',
          month, day, testKind,
          previewHiveName, previewCheckIn?.community_id,
          testKind === 'day_of' && previewCheckIn?.community_id && previewDateOnly
            ? await loadMeetingDetails(supabaseAdmin, previewCheckIn.community_id, previewDateOnly)
            : undefined,
        ),
      }),
    });
    if (!res.ok) return errorResponse(`Preview email failed: ${await res.text()}`, 502);
    return jsonResponse({ preview_sent_to: testEmail, kind: testKind, meeting: `${month} ${day}` });
  }

  // Force mode: POST { "force_send": true } sends now, ignoring the 3-days-before
  // date gate — for rescheduled meetings where the window already passed. Owners
  // only, like the preview above: this one puts an email and a push in front of
  // every member of the HIVE. Dedup still applies, but keyed to the survey's
  // CURRENT due date, so a reschedule gets one fresh send and repeat invocations
  // stay safe.
  const forceSend = body.force_send === true;

  /**
   * Approve mode: POST { "approve_notification_id": "<id>" } lets ONE held
   * touch through to the members it was rendered for.
   *
   * Owners only, like force_send — the owner check above has already run for
   * anything that is not the cron. The touch is replayed out of the held row's
   * own metadata rather than recomputed from today's date, so approving the
   * morning after still sends the thing she read, under the same dedup key it
   * was held with.
   */
  const approveId = typeof body.approve_notification_id === 'string'
    ? body.approve_notification_id.trim()
    : '';
  let approving: {
    id: string;
    survey_id: string;
    family: CheckInFamily;
    kind: string;
    touch: string | null;
    period: string;
    dueDateOnly: string;
  } | null = null;
  if (approveId) {
    const { data: heldRow } = await supabaseAdmin
      .from('notifications')
      .select('id, metadata')
      .eq('id', approveId)
      .maybeSingle();
    const meta = (heldRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? null;
    if (!meta || meta.check_in_approval !== 'pending') {
      return errorResponse('That check-in is not waiting for approval.', 404);
    }
    approving = {
      id: approveId,
      survey_id: String(meta.reminder_survey_id ?? ''),
      family: (meta.check_in_family === 'season' ? 'season' : 'monthly') as CheckInFamily,
      kind: String(meta.check_in_kind ?? ''),
      touch: meta.check_in_touch ? String(meta.check_in_touch) : null,
      period: String(meta.check_in_period ?? ''),
      dueDateOnly: String(meta.check_in_due_date ?? ''),
    };
    if (!approving.survey_id || !approving.period || !approving.dueDateOnly) {
      return errorResponse('That held check-in is missing what it needs to send.', 422);
    }
  }

  /**
   * Resend mode: POST { "resend_survey_id": "<id>" } queues ONE check-in's
   * opening invitation again, ignoring both the date gate and the dedup.
   *
   * Owners only, and it goes to the hold like everything else — so it is
   * "send that one again, but let me read it first", never a blast. It exists
   * because a link can be wrong in mail that has already left: Production's
   * pre-meeting email went out on 2026-08-15 at 9am and the fix to its button
   * landed that afternoon, and a member who joined after the send is not owed
   * silence just because the cron already ran.
   *
   * The period carries today's date, so the resend is its own send and the
   * original one is still recorded as having happened.
   */
  const resendSurveyId = typeof body.resend_survey_id === 'string'
    ? body.resend_survey_id.trim()
    : '';

  /** True when this run may put email in front of members at all. */
  const mayReachMembers = forceSend || !!approving;

  try {
    // Today's date as an America/Los_Angeles calendar date, 'YYYY-MM-DD'.
    // (See toPacificDateOnly: the meeting-day math must be Pacific, not UTC.)
    const todayStr = toPacificDateOnly(new Date());
    if (!todayStr) {
      return errorResponse('Failed to resolve current date', 500);
    }
    console.log(`[check-in-reminder] Running for ${todayStr} (America/Los_Angeles)`);

    // Auto-seal yesterday's meeting: if a community had a meeting yesterday and
    // nobody pressed Seal on the Wrap-Up slide, compose the live in-app record
    // now — the notes write themselves. Never blocks the reminder run.
    try {
      const yesterdayStr = toPacificDateOnly(new Date(Date.now() - 24 * 3600_000));
      if (yesterdayStr) {
        const { data: meetingEvents } = await supabaseAdmin
          .from('events')
          .select('community_id')
          .eq('event_type', 'meeting')
          .eq('event_date', yesterdayStr);
        const communityIds = [...new Set((meetingEvents ?? []).map((row: { community_id: string }) => row.community_id))];
        for (const communityId of communityIds) {
          const { data: sealedRows } = await supabaseAdmin
            .from('meetings')
            .select('id, summary')
            .eq('community_id', communityId)
            .eq('date', yesterdayStr);
          const alreadySealed = (sealedRows ?? []).some(
            (row: { summary: string | null }) => (row.summary ?? '').includes('"live_sealed_at"')
          );
          if (alreadySealed) continue;
          const sealRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/seal-meeting`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ communityId, date: yesterdayStr }),
          });
          console.log(`[check-in-reminder] auto-seal ${communityId} ${yesterdayStr}: ${sealRes.status}`);
        }
      }
    } catch (sealError) {
      console.error('[check-in-reminder] auto-seal skipped:', sealError);
    }

    // Fetch active surveys, then filter to monthly check-ins in JS.
    const { data: activeSurveys, error: surveysError } = await supabaseAdmin
      .from('surveys')
      .select('id, community_id, title, description, due_date, is_active')
      .eq('is_active', true);

    if (surveysError) {
      console.error('Error fetching surveys:', surveysError);
      return errorResponse('Failed to fetch surveys', 500);
    }

    const monthlyCheckIns = (activeSurveys as Survey[] | null ?? []).filter(
      (s) => MONTHLY_CHECK_IN_PATTERN.test(s.title || '')
    );

    let surveysFired = 0;
    let emailsSent = 0;
    let notificationsCreated = 0;
    let pushSent = 0;
    let skippedDedup = 0;
    /** Touches parked in Admin this run, waiting on Nat. */
    let heldForApproval = 0;
    const errors: string[] = [];

    for (const survey of monthlyCheckIns) {
      try {
        // Approving is about ONE held touch. Every other survey is left exactly
        // where it was rather than being re-examined on an unrelated request.
        if (approving && (approving.family !== 'monthly' || approving.survey_id !== survey.id)) continue;
        if (resendSurveyId && resendSurveyId !== survey.id) continue;
        if (!survey.due_date) continue;

        // Render the stored timestamptz as its Pacific calendar date — this is
        // the real meeting day members experience (see toPacificDateOnly).
        // On approval it comes off the held row instead, so a meeting that has
        // since been moved cannot rewrite the email she already read.
        const dueDateOnly = approving?.dueDateOnly ?? toPacificDateOnly(new Date(survey.due_date));
        if (!dueDateOnly) continue;

        // Which touch fires today (Pacific)? At most one per day; force_send
        // always means the full window invitation (rescheduled meetings).
        const windowOpen = getWindowOpenDate(dueDateOnly);
        const midpointDate = newsletterCheckInDate(todayStr);
        const kind: ReminderKind | null = approving
          ? (approving.kind as ReminderKind)
          : resendSurveyId || forceSend || todayStr === windowOpen
            ? 'window'
            : todayStr === dueDateOnly
              ? 'day_of'
              : todayStr === midpointDate
                ? 'midpoint'
                : null;
        if (!kind) {
          continue;
        }

        // Forced sends dedup per due date so a reschedule can send once more;
        // day-of and midpoint touches dedup under their own keys.
        const basePeriod = getSurveyResponsePeriod(dueDateOnly);
        const period = approving?.period ?? (resendSurveyId
          ? `${basePeriod}:resend-${todayStr}`
          : forceSend
          ? `${basePeriod}:${dueDateOnly}`
          : kind === 'window'
            ? basePeriod
            : kind === 'midpoint'
              // Month-end touch dedups by calendar month — it no longer belongs
              // to a meeting's cycle, so a reschedule must not re-fire it.
              ? `${todayStr.slice(0, 7)}:midpoint`
              : `${basePeriod}:${kind}`);

        // Dedup: skip if we've already sent this survey's reminder for this period.
        const { data: existingReminders, error: dedupError } = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('metadata->>reminder_survey_id', survey.id)
          .eq('metadata->>reminder_period', period)
          .limit(1);

        if (dedupError) {
          console.error(`Dedup check failed for survey ${survey.id}:`, dedupError);
          errors.push(`dedup:${survey.id}:${dedupError.message}`);
          continue;
        }

        if (existingReminders && existingReminders.length > 0) {
          console.log(`Already sent reminder for survey ${survey.id} period ${period}, skipping`);
          skippedDedup++;
          continue;
        }

        // Gather community members.
        const { data: memberships, error: memberError } = await supabaseAdmin
          .from('community_memberships')
          .select('user_id')
          .eq('community_id', survey.community_id);

        if (memberError || !memberships?.length) {
          console.error(`Error fetching members for community ${survey.community_id}:`, memberError);
          errors.push(`members:${survey.id}:${memberError?.message ?? 'no members'}`);
          continue;
        }

        let memberIds = memberships.map((m: { user_id: string }) => m.user_id);

        // Day-of only nags people who haven't checked in for this cycle. The
        // window invitation and the month-end newsletter ask go to everyone —
        // having filed a check-in says nothing about wanting a shout-out.
        if (kind === 'day_of') {
          const { data: responded } = await supabaseAdmin
            .from('survey_responses')
            .select('user_id')
            .eq('survey_id', survey.id)
            .eq('response_period', basePeriod);
          const respondedIds = new Set((responded ?? []).map((r: { user_id: string }) => r.user_id));
          memberIds = memberIds.filter((id: string) => !respondedIds.has(id));
          if (memberIds.length === 0) {
            console.log(`Everyone already checked in for ${survey.id} ${basePeriod} — skipping ${kind}`);
            continue;
          }
        }

        const { data: members, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, name, email, push_token, email_reminders_enabled, email_midpoint_checkin_enabled, email_meeting_checkin_enabled')
          .in('id', memberIds);

        if (profilesError || !members?.length) {
          console.error('Error fetching member profiles:', profilesError);
          errors.push(`profiles:${survey.id}:${profilesError?.message ?? 'no profiles'}`);
          continue;
        }

        const { month, day } = formatMeetingDate(dueDateOnly);
        // The newsletter covers the month that's ending, so its threads are
        // named for that month — not for whenever the next meeting lands.
        const newsletterMonth = MONTH_NAMES[Number(todayStr.split('-')[1]) - 1] ?? month;

        // Whose check-in this is. The email says it on the pill under the logo
        // and carries the id on its button, so the tune-up opens in the right
        // HIVE from wherever the reader's app happened to be standing.
        const { data: monthlyHiveRow } = await supabaseAdmin
          .from('communities')
          .select('name')
          .eq('id', survey.community_id)
          .maybeSingle();
        const monthlyHiveName = (monthlyHiveRow as { name?: string } | null)?.name || 'Your HIVE';

        // Midpoint doubles as newsletter season: open the "{Month} Newsletter"
        // thread on Announcements so shout-outs and reminders ("come to my
        // lemonade stand Tuesday!") land in one place Nat can write from.
        /**
         * NO NEWSLETTER THREADS. Nat, 2026-08-17, at length: *"we do not have
         * newsletter boards period"* — *"stop putting newsletter boards"* —
         * *"please please for the love of God correct this."*
         *
         * This block used to open a "{Month} Newsletter 📰" thread every month
         * for people to drop shout-outs into, which is what made a board feel
         * like the place the newsletter gets collected. It is not. The halfway
         * check-in's answers are where shout-outs come from, and they belong in
         * Admin's Newsletter box, which is where she writes the letter from.
         *
         * The Compliment Corner thread is a different thing and still opens —
         * it is a standing place to say something nice, not a collection bin
         * for a newsletter.
         */
        if (kind === 'midpoint' && mayReachMembers) {
          try {
            const { data: boards } = await supabaseAdmin
              .from('board_categories')
              .select('id, name, status, topic_kind')
              .eq('community_id', survey.community_id)
              .or('topic_kind.eq.newsletter,topic_kind.eq.compliments,name.ilike.%newsletter%,name.ilike.%announcement%');
            const boardRows = (boards ?? []) as { id: string; topic_kind?: string | null }[];
            // Compliment Corner is its own board now; newsletter threads stay
            // on the newsletter board. Fall back to whatever turned up.
            const boardId = boardRows.find((row) => row.topic_kind === 'newsletter')?.id ?? boardRows[0]?.id;
            const complimentBoardId = boardRows.find((row) => row.topic_kind === 'compliments')?.id ?? boardId;
            if (boardId) {
              // ONE thread per month, not two. It opens as the collection spot and
              // becomes the published newsletter in place when Nat posts it, so
              // the shout-outs that fed the letter stay underneath it. A board
              // of twelve threads a year reads as an archive; twenty-four reads
              // as a mess (Nat 2026-07-25).
              const complimentTitle = `${newsletterMonth} Compliment Corner 💐`;
              // These threads speak in Nat's voice, so they should carry her
              // name. "any admin, limit 1" was a coin flip that kept posting
              // them as Lucas.
              const { data: adminRows } = await supabaseAdmin
                .from('community_memberships')
                .select('user_id, user:profiles!user_id(name)')
                .eq('community_id', survey.community_id)
                .eq('role', 'admin');
              const admins = (adminRows ?? []) as { user_id: string; user?: { name?: string | null } | null }[];
              const authorId = (admins.find((row) => /^nat\b/i.test(row.user?.name ?? '')) ?? admins[0])?.user_id;
              // Compliment Corner stands alone now —
              // a standing place to say something nice, harvested for the
              // newsletter and the meeting.
              const { data: existingCompliments } = await supabaseAdmin
                .from('board_posts')
                .select('id')
                .eq('category_id', complimentBoardId)
                .eq('title', complimentTitle)
                .limit(1);
              if (authorId && !existingCompliments?.length) {
                await supabaseAdmin.from('board_posts').insert({
                  community_id: survey.community_id,
                  category_id: complimentBoardId,
                  author_id: authorId,
                  title: complimentTitle,
                  content:
                    'Want to compliment anyone this month? 💐 Drop it here — big, small, silly, sincere. @ them and they get a little love note the moment you post it. Compliments also get read out in the newsletter and at the meeting. No compliment too small.',
                });
              }
            }
          } catch (threadError) {
            console.error('Newsletter thread creation failed (non-blocking):', threadError);
          }
        }

        const notificationTitle =
          kind === 'day_of'
            ? '🐝 Meeting tonight — last call to check in'
            : kind === 'midpoint'
              ? '🍯 Halfway check-in — anything for the newsletter?'
              : '🐝 Monthly check-in is open';
        const notificationBody =
          kind === 'day_of'
            // Only ever sent to people who have NOT answered (the filter is a
            // few lines up), so it can say so plainly. Nat, 2026-08-17: *"just
            // a reminder we have this meeting coming up today. Fill in the
            // pre-meeting check-in."*
            ? `Just a reminder — we meet tonight, ${month} ${day}. Your pre-meeting check-in isn't in yet: about 2 minutes, and it lights you up on the Arrival Board.`
            : kind === 'midpoint'
              ? `The newsletter's brewing 🗞️ — want a shout-out, a plug, or a reminder in it? The 2-minute halfway check-in walks you there.`
              : `Take 5 minutes before the ${month} meeting — update your HDs and check in. ` +
                `It shows up on the Arrival Board and helps set the room.`;
        // The subject names the HIVE for the same reason the pill does: an inbox
        // shows the subject and nothing else, and a person can be in three
        // HIVEs at once (Nat, 2026-08-16). Same shape the season subjects use.
        const from = `${shortHiveName(monthlyHiveName)} · `;
        const emailSubject =
          kind === 'day_of'
            ? `🐝 ${from}Meeting tonight (${month} ${day}) — quick check-in if you haven't`
            : kind === 'midpoint'
              ? `🍯 ${from}Halfway check-in — the newsletter goes out on the 1st`
              : `🐝 ${from}Your check-in is open — meeting ${month} ${day}`;

        // Tonight as the meeting itself describes it — loaded once, used by
        // both the preview Nat reads and the copy every member gets, so what
        // she approves is exactly what goes out.
        const meetingDetails = kind === 'day_of'
          ? await loadMeetingDetails(supabaseAdmin, survey.community_id, dueDateOnly)
          : undefined;

        // THE HOLD. Nothing above this line has reached a member.
        if (!mayReachMembers) {
          const existingHold = await findHold(supabaseAdmin, survey.id, period);
          if (existingHold) {
            skippedDedup++;
            continue;
          }
          const parked = await holdForApproval(
            supabaseAdmin,
            survey,
            {
              family: 'monthly',
              kind,
              period,
              dueDateOnly,
              hiveName: monthlyHiveName,
              subject: emailSubject,
              recipients: (members as MemberProfile[]).length,
            },
            checkInEmailHtml('there', month, day, kind, monthlyHiveName, survey.community_id, meetingDetails),
          );
          if (parked) heldForApproval++;
          else errors.push(`hold:${survey.id}:no preview recipient`);
          continue;
        }

        surveysFired++;

        for (const member of members as MemberProfile[]) {
          try {
            // The month-end touch used to be email-free, on the reasoning that
            // the newsletter would carry the nudge. It can't: the newsletter
            // goes out on the 1st, AFTER the window it would be advertising —
            // the check-in feeds the newsletter, so it has to arrive first.
            //
            // And push reaches 2 of 10 members (checked 2026-07-25), so
            // push-only meant 8 people never heard about it at all. Members who
            // flipped off Email Reminders in their profile still never get app
            // emails.
            // Per-kind opt-out on top of the master switch. The HIVE sends
            // three app emails a cycle plus the newsletter and Izzy said one a
            // month is plenty — rather than cut one for everybody, each member
            // silences the ones they don't want (Nat 2026-07-26). The
            // meeting-day last call rides the pre-meeting toggle: someone who
            // muted the invitation does not want a chaser for it either.
            const wantsThisKind = kind === 'midpoint'
              ? member.email_midpoint_checkin_enabled !== false
              : member.email_meeting_checkin_enabled !== false;
            const hasEmail =
              member.email_reminders_enabled !== false &&
              wantsThisKind &&
              !!(RESEND_API_KEY && member.email);
            let emailDelivered = false;

            // Send email first so we can set email_sent accurately on the row.
            if (hasEmail) {
              const emailBody = checkInEmailHtml(
                member.name ?? 'there', month, day, kind,
                monthlyHiveName, survey.community_id, meetingDetails,
              );

              try {
                const res = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: member.email,
                    subject: emailSubject,
                    html: emailBody,
                  }),
                });
                if (res.ok) {
                  emailDelivered = true;
                  emailsSent++;
                } else {
                  const txt = await res.text();
                  console.error(`Email failed for ${member.email}:`, txt);
                }
              } catch (emailErr) {
                console.error(`Email error for ${member.email}:`, emailErr);
              }
            }

            // Create the in-app notification with dedup metadata marker.
            const { error: notifError } = await supabaseAdmin.from('notifications').insert({
              user_id: member.id,
              community_id: survey.community_id,
              notification_type: 'general',
              title: notificationTitle,
              content: notificationBody,
              email_sent: emailDelivered,
              metadata: {
                reminder_survey_id: survey.id,
                reminder_period: period,
              },
            });

            if (notifError) {
              console.error(`Failed to create notification for ${member.id}:`, notifError);
              errors.push(`notif:${member.id}:${notifError.message}`);
            } else {
              notificationsCreated++;
            }

            // Optional Expo push — non-fatal on failure.
            if (member.push_token) {
              try {
                await sendExpoPushNotification(
                  member.push_token,
                  notificationTitle,
                  notificationBody,
                  {
                    type: 'general',
                    reminder_survey_id: survey.id,
                    reminder_period: period,
                  }
                );
                pushSent++;
              } catch (pushError) {
                console.error(`Push failed for ${member.id}:`, pushError);
              }
            }
          } catch (memberErr) {
            console.error(`Member processing failed for ${member.id}:`, memberErr);
            errors.push(`member:${member.id}:${String(memberErr)}`);
          }
        }
      } catch (surveyErr) {
        console.error(`Survey processing failed for ${survey.id}:`, surveyErr);
        errors.push(`survey:${survey.id}:${String(surveyErr)}`);
      }
    }

    /* ---- The quarter and the year (2026-08-12) --------------------------
       Driven entirely by which HIVEs hold a launched, active season survey —
       a HIVE with none hears nothing, which is the safety property this cron
       was verified on. Two touches, computed from the survey's own due date
       (the quarter/year's last day), never from a hardcoded calendar:
         window — three days before the end (Mar 28, Jun 27, Sep 27, Dec 28)
         day_of — the end itself, only to people who haven't answered
       This loop deliberately repeats the monthly loop's shape instead of
       sharing its body: the monthly path is verified in production, and
       leaving it byte-for-byte untouched beats a refactor here. */
    const seasonCheckIns = (activeSurveys as Survey[] | null ?? [])
      .map((s) => ({
        survey: s,
        kind: END_OF_YEAR_CHECK_IN_PATTERN.test(s.title || '')
          ? ('year' as SeasonKind)
          : QUARTERLY_CHECK_IN_PATTERN.test(s.title || '')
            ? ('quarter' as SeasonKind)
            : PRE_MEETING_CHECK_IN_PATTERN.test(s.title || '')
              ? ('premeeting' as SeasonKind)
              : END_OF_MONTH_CHECK_IN_PATTERN.test(s.title || '')
                ? ('endofmonth' as SeasonKind)
                : null,
      }))
      .filter((entry): entry is { survey: Survey; kind: SeasonKind } => entry.kind !== null);

    for (const { survey, kind } of seasonCheckIns) {
      try {
        // Approving is about ONE held touch — see the monthly loop above.
        if (approving && (approving.family !== 'season' || approving.survey_id !== survey.id)) continue;
        if (resendSurveyId && resendSurveyId !== survey.id) continue;
        if (!survey.due_date) continue;
        const dueDateOnly = approving?.dueDateOnly ?? toPacificDateOnly(new Date(survey.due_date));
        if (!dueDateOnly) continue;

        const windowOpen = getWindowOpenDate(dueDateOnly);
        const touch: SeasonTouch | null = approving
          ? ((approving.touch ?? 'window') as SeasonTouch)
          : resendSurveyId || todayStr === windowOpen
            ? 'window'
            : todayStr === dueDateOnly
              ? 'day_of'
              : null;
        if (!touch) continue;

        // One notification row is the send receipt, exactly like the monthly.
        // The period carries the end date, so relaunching next quarter under
        // the same survey title can never be swallowed by last quarter's send.
        const period = approving?.period
          ?? (resendSurveyId
            ? `${dueDateOnly}:season-window:resend-${todayStr}`
            : `${dueDateOnly}:season-${touch}`);
        const { data: existingReminders, error: dedupError } = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('metadata->>reminder_survey_id', survey.id)
          .eq('metadata->>reminder_period', period)
          .limit(1);
        if (dedupError) {
          console.error(`Dedup check failed for season survey ${survey.id}:`, dedupError);
          errors.push(`dedup:${survey.id}:${dedupError.message}`);
          continue;
        }
        if (existingReminders && existingReminders.length > 0) {
          skippedDedup++;
          continue;
        }

        const { data: memberships, error: memberError } = await supabaseAdmin
          .from('community_memberships')
          .select('user_id')
          .eq('community_id', survey.community_id);
        if (memberError || !memberships?.length) {
          console.error(`Error fetching members for community ${survey.community_id}:`, memberError);
          errors.push(`members:${survey.id}:${memberError?.message ?? 'no members'}`);
          continue;
        }

        let memberIds = memberships.map((m: { user_id: string }) => m.user_id);

        // The day-of last call only nags people who haven't answered. One
        // survey row IS one occurrence, so any response to it means answered —
        // no period arithmetic like the monthly needs.
        if (touch === 'day_of') {
          const { data: responded } = await supabaseAdmin
            .from('survey_responses')
            .select('user_id')
            .eq('survey_id', survey.id);
          const respondedIds = new Set((responded ?? []).map((r: { user_id: string }) => r.user_id));
          memberIds = memberIds.filter((id: string) => !respondedIds.has(id));
          if (memberIds.length === 0) {
            console.log(`Everyone already answered season survey ${survey.id} — skipping ${touch}`);
            continue;
          }
        }

        const { data: members, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, name, email, push_token, email_reminders_enabled, email_meeting_checkin_enabled')
          .in('id', memberIds);
        if (profilesError || !members?.length) {
          console.error('Error fetching member profiles:', profilesError);
          errors.push(`profiles:${survey.id}:${profilesError?.message ?? 'no profiles'}`);
          continue;
        }

        const { month, day } = formatMeetingDate(dueDateOnly);
        const notificationTitle = kind === 'quarter'
          ? (touch === 'day_of'
              ? '🧭 Last day of the quarter — quick check-in if you haven\'t'
              : '🧭 Your quarterly check-in is open')
          : (touch === 'day_of'
              ? '🎉 Last day of the year — one look back before it goes'
              : '🎉 Your end-of-year check-in is open');
        const notificationBody = kind === 'quarter'
          ? (touch === 'day_of'
              ? `The quarter ends today and your check-in isn't in yet — five quiet minutes on Home closes the chapter.`
              : `The quarter wraps up ${month} ${day}. Five quiet minutes on Home: what happened, what you're proud of, what's next.`)
          : (touch === 'day_of'
              ? `The year ends today and your check-in isn't in yet — five minutes on Home and you walk into the new year with the story written down.`
              : `The year wraps up ${month} ${day}. Look back with us on Home — celebrate a little, and point at what comes next.`);
        // Whose HIVE the members are about to hear from. Every check-in email
        // says it in the subject line, because an inbox shows the subject and
        // nothing else, and a person can be in three HIVEs at once.
        const { data: seasonHive } = await supabaseAdmin
          .from('communities')
          .select('name')
          .eq('id', survey.community_id)
          .maybeSingle();
        const hiveName = (seasonHive as { name?: string } | null)?.name || 'Your HIVE';
        const emailSubject = seasonSubject(kind, touch, month, day, hiveName);

        // THE HOLD — same as the monthly loop. Nothing above this line has
        // reached a member.
        if (!mayReachMembers) {
          const existingHold = await findHold(supabaseAdmin, survey.id, period);
          if (existingHold) {
            skippedDedup++;
            continue;
          }
          const parked = await holdForApproval(
            supabaseAdmin,
            survey,
            {
              family: 'season',
              kind,
              touch,
              period,
              dueDateOnly,
              hiveName,
              subject: emailSubject,
              recipients: (members as MemberProfile[]).length,
            },
            seasonEmailHtml(
              'there', kind, touch, month, day, hiveName,
              survey.id, survey.community_id,
              `${hiveName} · closes ${month} ${day}`,
            ),
          );
          if (parked) heldForApproval++;
          else errors.push(`hold:${survey.id}:no preview recipient`);
          continue;
        }

        surveysFired++;

        for (const member of members as MemberProfile[]) {
          try {
            // Season check-ins ride the pre-meeting check-in toggle: they are
            // check-in invitations, and somebody who muted those did not mean
            // "except four times a year". The master switch still rules all.
            const hasEmail =
              member.email_reminders_enabled !== false &&
              member.email_meeting_checkin_enabled !== false &&
              !!(RESEND_API_KEY && member.email);
            let emailDelivered = false;

            if (hasEmail) {
              try {
                const res = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: member.email,
                    subject: emailSubject,
                    html: seasonEmailHtml(
                      member.name ?? 'there', kind, touch, month, day, hiveName,
                      survey.id, survey.community_id,
                      `${hiveName} · closes ${month} ${day}`,
                    ),
                  }),
                });
                if (res.ok) {
                  emailDelivered = true;
                  emailsSent++;
                } else {
                  console.error(`Email failed for ${member.email}:`, await res.text());
                }
              } catch (emailErr) {
                console.error(`Email error for ${member.email}:`, emailErr);
              }
            }

            const { error: notifError } = await supabaseAdmin.from('notifications').insert({
              user_id: member.id,
              community_id: survey.community_id,
              notification_type: 'general',
              title: notificationTitle,
              content: notificationBody,
              email_sent: emailDelivered,
              metadata: {
                reminder_survey_id: survey.id,
                reminder_period: period,
              },
            });
            if (notifError) {
              console.error(`Failed to create notification for ${member.id}:`, notifError);
              errors.push(`notif:${member.id}:${notifError.message}`);
            } else {
              notificationsCreated++;
            }

            if (member.push_token) {
              try {
                await sendExpoPushNotification(member.push_token, notificationTitle, notificationBody, {
                  type: 'general',
                  reminder_survey_id: survey.id,
                  reminder_period: period,
                });
                pushSent++;
              } catch (pushError) {
                console.error(`Push failed for ${member.id}:`, pushError);
              }
            }
          } catch (memberErr) {
            console.error(`Member processing failed for ${member.id}:`, memberErr);
            errors.push(`member:${member.id}:${String(memberErr)}`);
          }
        }
      } catch (surveyErr) {
        console.error(`Season survey processing failed for ${survey.id}:`, surveyErr);
        errors.push(`survey:${survey.id}:${String(surveyErr)}`);
      }
    }

    // The hold is spent once its members have it: the card leaves Admin, and
    // the row stays as the record of who approved what, and when.
    if (approving) {
      // Sent, or already sent — either way it is spent and the card leaves.
      // A double press lands on the dedup rows the first press wrote, which is
      // "done", not "failed", and must not put the card back.
      const settled = surveysFired > 0 || skippedDedup > 0;
      const { data: heldRow } = await supabaseAdmin
        .from('notifications')
        .select('metadata')
        .eq('id', approving.id)
        .maybeSingle();
      const meta = (heldRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
      await supabaseAdmin
        .from('notifications')
        .update({
          metadata: {
            ...meta,
            check_in_approval: settled ? 'approved' : 'pending',
            check_in_approved_at: new Date().toISOString(),
          },
        })
        .eq('id', approving.id);
      if (!settled) {
        return errorResponse('Nothing went out — that check-in no longer has anyone to send to.', 409);
      }
    }

    return jsonResponse({
      surveys_fired: surveysFired,
      emails_sent: emailsSent,
      notifications_created: notificationsCreated,
      push_sent: pushSent,
      skipped_dedup: skippedDedup,
      held_for_approval: heldForApproval,
      errors,
    });
  } catch (error) {
    console.error('check-in-reminder error:', error);
    return errorResponse('Internal server error', 500);
  }
});

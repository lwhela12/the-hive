import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { hiveMark, hiveSealImg, type HiveMark } from '../_shared/hiveMark.ts';
import {
  MONTHLY_CHECK_IN_PATTERN,
  QUARTERLY_CHECK_IN_PATTERN,
  END_OF_YEAR_CHECK_IN_PATTERN,
  PRE_MEETING_CHECK_IN_PATTERN,
  FIRST_MEETING_CHECK_IN_PATTERN,
  END_OF_MONTH_CHECK_IN_PATTERN,
} from '../_shared/checkInPatterns.ts';
import {
  MEMBER_NAME_TOKEN,
  eligibleEmailRecipientCount,
  formatClock,
  formatMeetingDate,
  getMeetingWindowOpenDate,
  getWindowOpenDate,
  meetingTimeWindow,
  monthlyMeetingDedupPeriod,
  monthlyMeetingSubject,
  personalizeHeldArtifact,
  responsePeriodForMeeting,
  shortHiveName,
  weekdayOf,
  type MeetingDetails,
} from './meetingArtifact.ts';
import { halfwayStepsFor } from '../_shared/halfwaySteps.ts';

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

// This function has no generated database schema. Pinning the generic prevents
// Deno from inferring every Supabase table operation as `never`.
type AdminClient = ReturnType<typeof createClient<any>>;

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
const logoBlock = (mark: HiveMark) => `
      <div style="text-align: center; padding: 8px 0 4px;">
        ${hiveSealImg(mark)}
      </div>`;

// How a check-in is recognised now lives in ONE file, read by this function and
// by the app (see _shared/checkInPatterns.ts). It used to be written out here
// and again in lib/checkIns.ts with "change one, change both" on both copies.
//
// A HIVE that holds no matching active survey hears nothing at all from this
// cron. That is the property that made it safe to leave running (verified
// 2026-08-11) and it must stay.
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

// IMPORTANT — "today" is always resolved in America/Los_Angeles, NOT UTC.
// Meeting event_date is already a plain Pacific calendar date; the three-day
// subtraction is plain date math in meetingArtifact.ts. The cron's two UTC
// candidates are guarded to let only the real 6am Pacific run through.
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
//   window   — a three-day run that ENDS on the meeting day (so a Wednesday
//              meeting opens on the Monday): the full check-in invitation
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

async function loadMeetingDetails(
  admin: AdminClient,
  communityId: string,
  fromDateOnly: string,
): Promise<MeetingDetails | null> {
  try {
    const { data, error } = await admin
      .from('events')
      .select('id, title, event_date, event_time, end_time, location, description, meet_link')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .gte('event_date', fromDateOnly)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(1);
    if (error) throw error;
    const row = data?.[0] as
      | {
          id: string;
          title: string | null;
          event_date: string;
          event_time: string | null;
          end_time: string | null;
          location: string | null;
          description: string | null;
          meet_link: string | null;
        }
      | undefined;
    if (!row?.id || !row.event_date) return null;
    const { month, day } = formatMeetingDate(row.event_date);
    return {
      meetingId: row.id,
      title: row.title?.trim() || 'HIVE meeting',
      dateOnly: row.event_date,
      weekday: weekdayOf(row.event_date),
      dateLabel: `${month} ${day}`,
      eventTime: row.event_time,
      endTime: row.end_time,
      timeLabel: formatClock(row.event_time),
      endTimeLabel: formatClock(row.end_time),
      location: row.location?.trim() || null,
      note: row.description?.trim() || null,
      meetLink: row.meet_link?.trim() || null,
    };
  } catch (err) {
    console.error('[check-in-reminder] could not read the next meeting row:', err);
    return null;
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
  /**
   * The HIVE's own costume — its slug, and its row's accent when it has one.
   *
   * Only the HALFWAY letter reads these, and only because Production's halfway
   * became a copy of OG's on 2026-08-28. Nat: *"we basically just need to copy
   * & re-skin that exact same thing for Pro HIVE."* Copy is the letter, which
   * is identical to the word; re-skin is these two arguments. Left off, a HIVE
   * gets OG's honey gold, which is what every caller before Production wanted
   * and still gets.
   *
   * The meeting letters above deliberately do NOT read them. They are OG's
   * rhythm and OG's alone right now, and a colour that changes nothing is a
   * colour that will be wrong the first time somebody else uses them.
   */
  hiveSlug?: string | null,
  hiveAccent?: string | null,
): string {
  // Escaped once, here, so every path out of this function is safe by default.
  const name = escapeHtml(rawName);
  const hive = escapeHtml(rawHiveName);
  const mark = hiveMark(hiveSlug, hiveAccent);
  const kicker = `<p style="text-align: center; color: #bd9348; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>`;
  const halfwayKicker = `<p style="text-align: center; color: ${mark.accent}; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>`;
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
    // "from 5:00 – 7:00 PM" when the meeting has an end time, the AM/PM said
    // once — Nat: "i couldnt add window, like 5-7, i could only put in
    // 5pm" (migration 202). No end time, no change: the line reads exactly
    // as it always has.
    const timeWindow = meeting ? meetingTimeWindow(meeting) : null;
    const whenLine = timeWindow
      ? `${when} · from ${timeWindow}`
      : when;
    const note = meeting?.note ? noteHtml(meeting.note) : '';
    const where = meeting?.location
      ? `<p style="font-size: 15px; color: #6b6b6b; margin: 0 0 18px;">📍 ${escapeHtml(meeting.location)}</p>`
      : '';
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      ${logoBlock(mark)}
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
    /**
     * The halfway letter — the one Nat calls perfect, now worn by every HIVE
     * whose halfway shape says `flow: 'tuneup'` (OG and Production, 2026-08-28).
     *
     * The bullets are the steps of the wizard the button opens, in the order it
     * walks them, so the letter is a truthful table of contents rather than a
     * pitch — and they come from `_shared/halfwaySteps.ts` so they cannot drift
     * from the flow they describe. That drift is not hypothetical: the third
     * bullet said "Life moved? Update your HD wish", which is a PRE-MEETING step
     * and is not in this flow at all, and then briefly offered Production a HIVE
     * Help step it does not have (Nat, 2026-08-28: *"Pro HIVE 1/2 way check in
     * is ALMOST beat for beat like OG HIVE, except Pro HIVE does NOT have a HIVE
     * Help"*). Both were the same mistake: the letter written by hand, beside a
     * flow written in a list.
     *
     * Everything colour is `mark`; everything else is byte-for-byte the letter
     * OG has been sending. That is the whole of the re-skin.
     */
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      ${logoBlock(mark)}
      ${halfwayKicker}
      <h1 style="color: ${mark.accent}; font-size: 22px; text-align: center; margin: 8px 0 4px;">End of the month</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">The newsletter goes out on the 1st</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">No meeting tonight — but the newsletter goes out soon, and this is the easy way in:</p>
      <ul style="font-size: 15px; padding-left: 20px;">
        ${halfwayStepsFor(hiveSlug).map((step) => `<li>${step}</li>`).join('\n        ')}
      </ul>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${tuneupHref('midpoint')}" style="background: ${mark.accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Take the 2-minute check-in</a>
      </div>
    </div>
  `;
  }
  const when = meeting ? `${meeting.weekday}, ${meeting.dateLabel}` : `${month} ${day}`;
  const timeWindow = meeting ? meetingTimeWindow(meeting) : null;
  const whenLine = timeWindow ? `${when} · from ${timeWindow}` : when;
  const meetingTitle = escapeHtml(meeting?.title || 'HIVE meeting');
  const note = meeting?.note ? noteHtml(meeting.note) : '';
  const where = meeting?.location
    ? `<p style="font-size: 15px; color: #6b6b6b; margin: 0 0 18px;">📍 ${escapeHtml(meeting.location)}</p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      ${logoBlock(mark)}
      ${kicker}
      <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">Your check-in is open</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${escapeHtml(whenLine)}</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">Before we meet — the check-in for <strong>${meetingTitle}</strong> is open — one walkthrough, about <strong>5 minutes</strong>:</p>
      <ul style="font-size: 15px; padding-left: 20px;">
        <li>Your HD wishes — anything change? Anyone help?</li>
        <li>Hang ideas &amp; the calendar (out of town? add the stretch!)</li>
        <li>A few quick questions: your name-for-today, energy, and POP</li>
      </ul>
      ${note}
      ${where}
      <p style="font-size: 15px;">Each step has a <strong>Looks good →</strong> button, so if nothing's new you can breeze through in under a minute. Checking in shows up on the Arrival Board and helps set the room before we gather.</p>
      <p style="font-size: 14px; color: #8a6b30; background: #fdf3dc; border-radius: 12px; padding: 10px 14px;">Already done your check-in this month? You're all set — feel free to skip this, or pop in any time to update your answers.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${tuneupHref()}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Open H.I.V.E. and check in</a>
      </div>
      <p style="font-size: 14px; color: #6b6b6b;"><strong>Can't make the meeting?</strong> No worries — after Wrap-Up, HIVE can email you two direct ways to catch up: open the meeting summary or ask Clive what you missed. If you don't want recap emails, turn off <strong>Recap email if I miss a meeting</strong> in Profile → Settings.</p>
      <p style="font-size: 13px; color: #9a9a9a; text-align: center;">See you at ${meetingTitle}. 🍯</p>
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
  /**
   * The HIVE's own slug and accent, so the letter wears its own costume.
   *
   * Nat, 2026-08-27, opening Tech HIVE's check-in: *"Tech HIVE has the wrong
   * emoji — it has the director's cut board, like for movies. Tech HIVE should
   * have the little robot… Tech HIVE is the wrong colour too — I just opened
   * the survey and it's purple."* The clapperboard and the purple were typed
   * into this file when Production was the only HIVE it wrote to, so every
   * other HIVE inherited Production's dress. `_shared/hiveMark.ts` is the one
   * table now; the row's own `accent_color` wins when the caller selected it.
   */
  hiveSlug?: string | null,
  hiveAccent?: string | null,
  /**
   * Whether this is the HIVE's FIRST meeting.
   *
   * "Before we meet" is written for a room that has met. On a first night it
   * describes a rhythm nobody has been part of yet, and the check-in behind it
   * is a different thing entirely: onboarding, not a status report. Nat,
   * 2026-08-31: it *"walks you through filling out your profile and stuff"* —
   * it fills your intro, it seeds your HummDinger, and it votes on how the
   * HIVE will run.
   *
   * The letter that reached her inbox on 27 Aug promised "how often you want
   * to meet, what day works, how you feel about a Honey Pot, and who is
   * allowed to know" — three of those four are not questions any more. A
   * letter is a promise about what is behind the button.
   */
  firstMeeting?: boolean,
  /**
   * The meeting this letter is about, for the `premeeting` kinds.
   *
   * It said *"It's today"* and *"September 3"* and stopped there — no hour, no
   * address, no Meet link, on the morning of Tech HIVE's first ever meeting.
   * The MONTHLY letter has carried weekday, time window, place and Nat's note
   * since August (`checkInEmailHtml`); Tech runs on the season path, so its
   * members had never once been told when or where in an email.
   *
   * Same rule as the monthly one: everything here comes off the meeting ROW.
   * The letter says nothing the calendar has not said first.
   */
  meeting?: MeetingDetails | null,
): string {
  const name = escapeHtml(rawName);
  const mark = hiveMark(hiveSlug, hiveAccent);
  // Whose HIVE this is, said in the email itself and on the button. Nat,
  // 2026-08-15: *"I think it should have either the hive honeybee or a pro
  // hive before we meet ... I think it's just open pro hive."*
  const hive = escapeHtml(rawHiveName);
  const kicker = `<p style="text-align: center; color: ${mark.accent}; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>`;
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
  const openButton = `<a href="${openHref}" style="background: ${mark.accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Open the check-in</a>`;
  if (kind === 'endofmonth') {
    /**
     * **Nothing here says when the month ends.**
     *
     * Nat, 2026-08-27, reading the one that reached her inbox: *"'the month
     * ends August 30th' is factually wrong AND unnecessary."* It was the
     * check-in's due date wearing the month's name, so it was a day early
     * every single month — and nobody needs telling when August finishes.
     * The line that replaces it is the one OG's halfway email has always
     * carried, and it is the true reason the email arrived: **the newsletter
     * goes out on the 1st.** "Closes" went with it, from the heading and from
     * the footer — a check-in that is open for you is not a door shutting.
     *
     * The questions ask like questions now, and the halfway line parses:
     * *"'A gentle one, halfway through' does not parse. Say something like
     * 'we're halfway through the month'."*
     */
    const heading = touch === 'day_of' ? 'Last call' : 'End of the month';
    const body = touch === 'day_of'
      ? `Last call for the newsletter — it goes out on the 1st. Nothing owed: just a quick one if you want a hand with anything, or you have something to put in.`
      : `We're halfway through the month. How is it going? Is there anything you want a hand with? And have you got anything for the newsletter — a shout-out, a plug, an event to come to, a reminder, or a compliment for someone? Blanks are completely fine, and whatever is still on your list is on your to-do list in the app.`;
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
        <div style="text-align: center; padding: 8px 0 4px;">${hiveSealImg(mark)}</div>
        ${kicker}
        <h1 style="color: ${mark.accent}; font-size: 22px; text-align: center; margin: 8px 0 4px;">${heading}</h1>
        <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">The newsletter goes out on the 1st</p>
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
    const heading = touch === 'day_of'
      ? "It's today"
      // One name for both. A first night is still "Before we meet" — the
      // letter says it is the first one in its own sentence below, and the
      // subject line says so too, so the HEADING does not need a second name.
      : 'Before we meet';
    const body = firstMeeting
      ? (touch === 'day_of'
          ? `We meet tonight and your answers aren't in yet — about <strong>3 minutes</strong>. It is what fills your spot in the room: your intro, what you are building, and your say in how we run this.`
          : `The check-in is open — about <strong>3 minutes</strong>, and it sets up your spot in the room. Your intro, what you are building, where you are stuck, and your say in how we run this: the evening that suits you, whether we want a HIVE Help, and whether we keep a Honey Pot. Everything you write comes back on screen on the night. Short answers are perfect.`)
      : (touch === 'day_of'
          ? `We meet today and your answers aren't in yet — it takes about <strong>3 minutes</strong>, and it means we can spend the hour deciding together instead of asking each other questions.`
          : `Our check-in is open — about <strong>3 minutes</strong>. Where your jobs got to, what is stuck, and how much you can take on. Answering beforehand means the meeting gets to decide. Short answers are perfect.`);
    // When and where, off the meeting row — never asserted from the due date.
    const when = meeting ? `${meeting.weekday}, ${meeting.dateLabel}` : `${month} ${day}`;
    const timeWindow = meeting ? meetingTimeWindow(meeting) : null;
    const whenLine = timeWindow ? `${when} · from ${timeWindow}` : when;
    const where = meeting?.location
      ? `<p style="font-size: 15px; color: #6b6b6b; margin: 0 0 6px;">📍 ${escapeHtml(meeting.location)}</p>`
      : '';
    // A HIVE that meets on Meet needs the door, not just the address.
    const joinLine = meeting?.meetLink
      ? `<p style="font-size: 15px; margin: 0 0 18px;"><a href="${escapeHtml(meeting.meetLink)}" style="color: ${mark.accent};">Join on Google Meet</a></p>`
      : '';
    const note = meeting?.note ? noteHtml(meeting.note) : '';
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
        <div style="text-align: center; padding: 8px 0 4px;">${hiveSealImg(mark)}</div>
        ${kicker}
        <h1 style="color: ${mark.accent}; font-size: 22px; text-align: center; margin: 8px 0 4px;">${heading}</h1>
        <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${whenLine}</p>
        <p style="font-size: 15px;">Hi ${name},</p>
        ${where}
        ${joinLine}
        ${note}
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
  // The season emoji (🧭 / 🎉) lives in the subject line and the push now — the
  // picture at the top of this letter is the HIVE's seal, the same as the
  // before-we-meet and end-of-the-month letters above it.
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
        ${hiveSealImg(mark)}
      </div>
      <p style="text-align: center; color: ${mark.accent}; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px;">${hive}</p>
      <h1 style="color: ${mark.accent}; font-size: 22px; text-align: center; margin: 8px 0 4px;">${heading}</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">${sub}</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">${body}</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${openHref}" style="background: ${mark.accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">${button}</a>
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
  /** The HIVE's slug, so its own emoji leads the subject line rather than
   *  Production's clapperboard (see `_shared/hiveMark.ts`). */
  hiveSlug?: string | null,
  /** A first meeting cannot be announced as "before we meet". */
  firstMeeting?: boolean,
): string {
  const from = `${shortHiveName(hiveName)} · `;
  const month = SHORT_MONTHS[fullMonth] ?? fullMonth;
  const emoji = hiveMark(hiveSlug).emoji;
  if (kind === 'premeeting') {
    if (touch === 'day_of') return `${emoji} ${from}We meet today — 3 minutes before we do`;
    return firstMeeting
      ? `${emoji} ${from}Our first meeting is ${month} ${day} — your check-in is open`
      : `${emoji} ${from}Before we meet on ${month} ${day} — your check-in is open`;
  }
  if (kind === 'endofmonth') {
    /**
     * **`Pro HIVE · End of the month`, and nothing after it.**
     *
     * The tail used to read "— no obligations". Nat, 2026-08-27, cut it: an
     * inbox shows perhaps forty characters, and those are spent apologising for
     * an email nobody had objected to yet. The words that matter are whose HIVE
     * it is and what it is, and both HIVEs say them the same way now.
     *
     * `day_of` is unreachable for this kind since 2026-08-28 — the halfway is a
     * single letter, like OG's — and the line stays because deleting it is how
     * a fifth touch quietly gets no subject at all.
     */
    return touch === 'day_of'
      ? `${emoji} ${from}Last call — anything for the newsletter?`
      : `${emoji} ${from}End of the month`;
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
  /** Exact approved member artifact; only the escaped greeting name is substituted. */
  htmlTemplate: string;
  /** Meeting row frozen at preview time for auditability and explicit resends. */
  meeting?: MeetingDetails;
};

/** The profile the preview goes to. Fails closed: no Nat, no send to anybody. */
async function findPreviewProfile(
  admin: AdminClient,
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

/**
 * The plain-text half of every letter this function sends.
 *
 * **A one-part HTML email reads as an advertisement.** Real mail from a person
 * carries both a text and an HTML part; bulk marketing usually carries only the
 * HTML, and Gmail treats the shape as evidence. Nat's check-in previews landed
 * in Promotions on 2026-08-28 and she asked for them not to.
 *
 * It is not only a deliverability trick. The text part is what a screen reader
 * gets when images are off, what a watch shows, and what a search index reads.
 * The HTML has always been the only copy; now it is the pretty copy.
 *
 * Deliberately simple: this reads the letters THIS file writes, not arbitrary
 * markup. Block tags become newlines, list items become dashes, links keep
 * their address, and everything else is stripped and unescaped.
 */
function plainTextFrom(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) =>
      `${String(label).replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    // `li` is absent on purpose: `<li>` already opens its own line above, and
    // closing it as well put a blank line between every bullet.
    .replace(/<\/(p|div|h1|h2|h3|ul|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(#39|apos);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((line) => line.trim()).join('\n')
    .trim();
}

/** A band across the top of the preview saying what pressing go would do. */
/**
 * The banner on Nat's preview, and the way in.
 *
 * Nat, 2026-09-02: *"I need to be able to approve it from inside the email."*
 * Until now she could not — the approve endpoint existed and nothing called it,
 * so every check-in that has ever gone out went out because somebody ran the
 * function for her.
 *
 * **The link does not send anything.** That distinction is the whole design,
 * and the reason there was no link here before (2026-08-17): a one-tap
 * send-to-everyone address in an inbox is a members-wide blast that a mail
 * scanner, a link preview or a forward can trip on its own. This one opens a
 * screen inside the app that shows what will go and to whom, behind her login,
 * with the button there. Anything that follows the URL out of curiosity sees a
 * page and sends nothing.
 */
function previewBanner(held: HeldTouch, hiveName: string, holdId: string | null): string {
  const who = `${escapeHtml(hiveName)} · ${held.recipients} ${held.recipients === 1 ? 'person' : 'people'}`;
  const door = holdId
    ? `
        <p style="margin: 12px 0 0;">
          <a href="${APP_URL}/approve/${encodeURIComponent(holdId)}"
             style="display: inline-block; background: #bd9348; color: #fffdf5; text-decoration: none; font-weight: 700; font-size: 14px; padding: 11px 20px; border-radius: 999px;">
            Open it in HIVE
          </a>
        </p>
        <p style="margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: #8a7550;">
          That link only opens the app. You will see who it goes to and press Send there.
        </p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto 18px;">
      <div style="background: #fdf3dc; border: 1px solid #e6d2a4; border-radius: 14px; padding: 14px 16px; color: #6b5220;">
        <p style="margin: 0 0 6px; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 700;">Waiting for your go-ahead</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.5;">Nobody has this yet. Below is exactly what <strong>${who}</strong> will get. Say the word and it goes out — if you do nothing, nothing sends.</p>
        ${door}
      </div>
    </div>`;
}

/**
 * Whether this exact touch has already been let through.
 *
 * The approval lives on the preview row's own metadata, so there is one object
 * per held touch and no second table to keep in step.
 *
 * **A retired preview is not a hold.** Only `pending` (waiting on Nat) and
 * `approved` (already gone out) mean "this touch is spoken for". Anything else
 * is a preview that was taken out of service, and it must not stand in the way
 * of building the real one.
 *
 * This cost Production HIVE its halfway preview on 29 Aug 2026. The 27 Aug
 * preview had been built from the wrong check-in and was marked `superseded`
 * so Nat could not approve it by accident — but it kept Production's period
 * key, `2026-08-30:season-window`, so on the morning the good letter was due
 * this lookup found the dead row, called the touch already held, and Nat's
 * inbox got OG's preview and nothing else. She was at the cabin, expecting two.
 */
const LIVE_HOLD_STATES = new Set(['pending', 'approved']);

async function findHold(
  admin: AdminClient,
  surveyId: string,
  period: string,
): Promise<{ id: string; approved: boolean } | null> {
  const { data } = await admin
    .from('notifications')
    .select('id, metadata')
    .eq('metadata->>reminder_survey_id', surveyId)
    .eq('metadata->>reminder_period', `${period}:preview`)
    .in('metadata->>check_in_approval', [...LIVE_HOLD_STATES])
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
  admin: AdminClient,
  survey: Survey,
  held: HeldTouch,
): Promise<boolean> {
  const previewTo = await findPreviewProfile(admin);
  if (!previewTo) {
    console.error('[check-in-reminder] no preview profile found — holding without sending');
    return false;
  }

  /**
   * The hold is parked FIRST, and the email is sent second.
   *
   * It used to be the other way round, which was fine while the email carried
   * no link — but the door in it is `/approve/<hold id>`, and that id does not
   * exist until the row does. Parking first also fails in the safer direction:
   * a hold with no email is a check-in Nat can still find waiting in the app,
   * whereas an email pointing at a row that was never written is a dead button
   * on the one screen that has to work.
   */
  const { data: heldRow, error } = await admin.from('notifications').insert({
    user_id: previewTo.id,
    community_id: survey.community_id,
    notification_type: 'general',
    title: `✋ ${held.hiveName} check-in is waiting on you`,
    content: `${held.recipients} ${held.recipients === 1 ? 'person' : 'people'} get "${held.subject}" once you say go. Tap to read it and send it.`,
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
      check_in_html_template: held.htmlTemplate,
      check_in_meeting: held.meeting ?? null,
      check_in_copy_version: 1,
    },
  })
    .select('id')
    .single();
  if (error) {
    console.error('[check-in-reminder] could not park the hold:', error);
    // No hold means no way to approve, so there is nothing honest to email
    // about. Better silent than a preview nobody can act on.
    return false;
  }

  const holdId = (heldRow as { id?: string } | null)?.id ?? null;

  if (RESEND_API_KEY) {
    const previewBody = `${previewBanner(held, held.hiveName, holdId)}${personalizeHeldArtifact(held.htmlTemplate, 'there')}`;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: previewTo.email,
          subject: `[Waiting on you] ${held.subject}`,
          html: previewBody,
          text: plainTextFrom(previewBody),
        }),
      });
      if (!res.ok) console.error('[check-in-reminder] preview email failed:', await res.text());
    } catch (previewError) {
      console.error('[check-in-reminder] preview email error:', previewError);
    }
  }

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
  // still request a forced preview after a meeting moves — those tools are
  // genuinely useful, and approval remains the only member-facing door.
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

  // Retired for every caller/mode: no frozen approvals, force/resend, preview,
  // monthly or season branch may bypass canonical occurrence receipts/claims.
  // Only the existing service-role maintenance call retains auto-sealing.
  if (calledByCron && !Object.keys(body).length) {
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

  }
  return jsonResponse({
    status: 'retired',
    error: 'Legacy check-in emails are retired. Use open-check-in for the shared Before we meet or End of the month check-in. Existing holds cannot be approved or resent.',
    canonical_sender: 'open-check-in',
    canonical_sending: 'owner_manual_only',
    emails_sent: 0,
  }, 410);
});

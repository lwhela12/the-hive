import { hiveMark, hiveSealImg } from './hiveMark.ts';
import type { MeetingRecapContent } from './meetingRecapContent.ts';
export interface RecapMeeting {
  id: string;
  communityId: string;
  hiveName: string;
  title: string;
  date: string;
  /**
   * Whose HIVE this meeting was, in the two fields a letter needs to dress
   * itself — its seal and its colour (Nat, 2026-09-04).
   *
   * Optional because the recap ran for a fortnight without them and a meeting
   * row that predates the column should still send. Missing means the letter
   * falls back to the HIVE-Wide mark, which says "HIVE" honestly rather than
   * putting one HIVE's costume on another's night.
   */
  hiveSlug?: string | null;
  hiveAccent?: string | null;
  /** The exact short recap frozen when Nat previews it. */
  recap?: MeetingRecapContent | null;
}

export interface RecapRecipient {
  id: string;
  name: string | null;
  email: string | null;
  emailRemindersEnabled?: boolean | null;
  emailPostMeetingRecapEnabled?: boolean | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'there';
}

export function buildPostMeetingRecapLinks(appUrl: string, meeting: RecapMeeting) {
  const base = appUrl.replace(/\/$/, '');
  const hive = encodeURIComponent(meeting.communityId);
  const meetingId = encodeURIComponent(meeting.id);
  const [year, month, day] = meeting.date.split('-').map(Number);
  const friendlyDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : meeting.date;
  // This becomes the person's visible first message to Clive. Keep routing ids
  // in the URL where they belong; nobody talks in UUIDs (Nat, 2026-08-18).
  const context = `Hey Clive — I missed ${meeting.title} on ${friendlyDate}. Can you catch me up? Start with the decisions, anything I need to do, and what I should know before the next meeting.`;

  return {
    summaryUrl: `${base}/meetings?hive=${hive}&meeting=${meetingId}`,
    cliveUrl: `${base}/?hive=${hive}&prefill=${encodeURIComponent(context)}`,
    cliveContext: context,
  };
}

export function eligibleRecapRecipients(
  confirmedAbsentUserIds: string[],
  profiles: RecapRecipient[],
): RecapRecipient[] {
  const confirmed = new Set(confirmedAbsentUserIds);
  return profiles.filter((profile) =>
    confirmed.has(profile.id)
    && !!profile.email?.trim()
    && profile.emailRemindersEnabled !== false
    && profile.emailPostMeetingRecapEnabled !== false
  );
}

/**
 * Resolve a held approval against the exact list Nat saw in her preview.
 * Opting out before Send can remove someone; opting in afterward cannot add a
 * person she did not approve. Previously sent copies are also never repeated.
 */
export function recipientsForApprovedPreview(
  previewedRecipientIds: string[],
  alreadySentRecipientIds: string[],
  profiles: RecapRecipient[],
): { recipients: RecapRecipient[]; becameIneligibleCount: number } {
  const eligible = eligibleRecapRecipients(previewedRecipientIds, profiles);
  const alreadySent = new Set(alreadySentRecipientIds);
  return {
    recipients: eligible.filter((recipient) => !alreadySent.has(recipient.id)),
    becameIneligibleCount: previewedRecipientIds.length - eligible.length,
  };
}

export function postMeetingRecapSubject(meeting: RecapMeeting): string {
  return `${meeting.hiveName} · What you missed at ${meeting.title}`;
}

function prettyDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function prettyTime(value: string): string {
  const [rawHour, rawMinute = '00'] = value.split(':');
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const twelve = hour % 12 || 12;
  return rawMinute === '00' ? `${twelve}${suffix}` : `${twelve}:${rawMinute}${suffix}`;
}

function prettyTimeRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  const from = prettyTime(start);
  if (!end) return from;
  const to = prettyTime(end);
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -2)}-${to}` : `${from}-${to}`;
}

function recapSection(title: string, body: string): string {
  return `
    <div style="border-top:1px solid #eadfcf;padding:16px 0 0;margin-top:16px;">
      <p style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;color:#7d642f;margin:0 0 8px;">${title}</p>
      ${body}
    </div>`;
}

function bulletList(lines: string[]): string {
  return `<ul style="padding-left:20px;margin:0;color:#2b2b2b;">${lines.map((line) =>
    `<li style="margin:0 0 6px;font-size:14px;line-height:1.45;">${escapeHtml(line)}</li>`
  ).join('')}</ul>`;
}

function postMeetingRecapBody(meeting: RecapMeeting): string {
  const recap = meeting.recap;
  if (!recap) return '';

  const news = recap.news.length > 0
    ? bulletList(recap.news)
    : '<p style="margin:0;font-size:14px;color:#777;">No News from Nat was recorded.</p>';
  const dates = recap.dates.length > 0
    ? `<div>${recap.dates.map((item) => {
        const when = [
          prettyDate(item.date),
          prettyTimeRange(item.time, item.endTime),
          item.location ?? '',
        ].filter(Boolean).map(escapeHtml).join(' · ');
        return `<p style="margin:0 0 8px;font-size:14px;line-height:1.45;"><strong>${escapeHtml(item.label)}</strong><br><span style="color:#6b6b6b;">${when}</span></p>`;
      }).join('')}</div>`
    : '<p style="margin:0;font-size:14px;color:#777;">No future dates were recorded.</p>';
  const help = `<p style="margin:0;font-size:14px;line-height:1.45;">${escapeHtml(recap.helpFocus || 'No HIVE Help focus was recorded.')}</p>`;
  const wishes = recap.wishes.length > 0
    ? `<div>${recap.wishes.map((item) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.45;"><strong>${escapeHtml(firstName(item.personName))}:</strong> ${escapeHtml(item.wish || 'No current wish yet')}</p>`).join('')}</div>`
    : '<p style="margin:0;font-size:14px;color:#777;">No member wishes are available yet.</p>';

  return `${recapSection('📣 News from Nat', news)}${recapSection('🗓️ Dates to know', dates)}${recapSection('🤝 This month’s HIVE Help', help)}${recapSection('💛 Everyone’s current wish', wishes)}`;
}

/** Member email. Deliberately contains exactly two links/buttons. */
export function postMeetingRecapHtml(
  rawName: string | null,
  meeting: RecapMeeting,
  appUrl: string,
): string {
  const name = escapeHtml(firstName(rawName));
  const hive = escapeHtml(meeting.hiveName);
  const title = escapeHtml(meeting.title);
  const { summaryUrl, cliveUrl } = buildPostMeetingRecapLinks(appUrl, meeting);

  // Nat, 2026-08-24, reading this email live: "the only thing missing is one
  // of our bee's or logos or something." It carried the one-logo-for-everybody
  // until 2026-09-04; it wears THIS HIVE's seal now, so a recap of a Tech night
  // does not arrive dressed as OG. No white tile any more — the seals are
  // transparent PNGs and a round badge on a white square looked like a sticker
  // somebody had not peeled.
  const mark = hiveMark(meeting.hiveSlug, meeting.hiveAccent);
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2b2b2b;line-height:1.5;">
      <div style="text-align:center;padding:8px 0 4px;">
        ${hiveSealImg(mark)}
      </div>
      <p style="text-align:center;color:${mark.accent};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;margin:0 0 2px;">${hive}</p>
      <h1 style="color:${mark.accent};font-size:22px;text-align:center;margin:8px 0 4px;">What you missed</h1>
      <p style="text-align:center;color:#6b6b6b;font-size:14px;margin:0 0 20px;">${title}</p>
      <p style="font-size:15px;">Hi ${name},</p>
      <p style="font-size:15px;">We missed you. Here is the one-minute version of what matters from the meeting.</p>
      ${postMeetingRecapBody(meeting)}
      <div style="text-align:center;margin:28px 0 12px;">
        <a href="${summaryUrl}" style="background:${mark.accent};color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px;font-weight:600;display:inline-block;">Open full meeting record</a>
      </div>
      <div style="text-align:center;margin:12px 0 28px;">
        <a href="${cliveUrl}" style="background:${mark.companion};color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px;font-weight:600;display:inline-block;">Ask Clive what I missed</a>
      </div>
      <p style="font-size:12px;color:#9a9a9a;text-align:center;">You received this because you were marked absent at Wrap-Up. Turn off <strong>Recap email if I miss a meeting</strong> in Profile → Settings any time.</p>
    </div>`;
}

export function recapPreviewBanner(meeting: RecapMeeting, recipientCount: number): string {
  const hive = escapeHtml(meeting.hiveName);
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto 18px;">
      <div style="background:#fdf3dc;border:1px solid #e6d2a4;border-radius:14px;padding:14px 16px;color:#6b5220;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;">Waiting for your go-ahead</p>
        <p style="margin:0;font-size:14px;line-height:1.5;">Nobody has this yet. Below is the member email for <strong>${hive}</strong>. Approval sends it only to the ${recipientCount} confirmed ${recipientCount === 1 ? 'absentee who still has' : 'absentees who still have'} recap email turned on. If you do nothing, nothing sends.</p>
      </div>
    </div>`;
}

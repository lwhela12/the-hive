export const REMINDER_WINDOW_DAYS = 3;
export const MEMBER_NAME_TOKEN = '__HIVE_MEMBER_NAME__';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT_MONTHS: Record<string, string> = {
  January: 'Jan',
  February: 'Feb',
  March: 'Mar',
  April: 'Apr',
  May: 'May',
  June: 'Jun',
  July: 'Jul',
  August: 'Aug',
  September: 'Sept',
  October: 'Oct',
  November: 'Nov',
  December: 'Dec',
};
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type MonthlyReminderKind = 'window' | 'day_of' | 'midpoint';

export interface MeetingDetails {
  meetingId: string;
  title: string;
  dateOnly: string;
  weekday: string;
  dateLabel: string;
  eventTime: string | null;
  endTime: string | null;
  timeLabel: string | null;
  endTimeLabel: string | null;
  location: string | null;
  note: string | null;
}

export interface EmailPreferenceProfile {
  email: string | null;
  email_reminders_enabled?: boolean | null;
  email_midpoint_checkin_enabled?: boolean | null;
  email_meeting_checkin_enabled?: boolean | null;
}

export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export function getWindowOpenDate(meetingDateOnly: string): string {
  return addDaysToDateOnly(meetingDateOnly, -REMINDER_WINDOW_DAYS);
}

export function responsePeriodForMeeting(meeting: MeetingDetails): string {
  return meeting.dateOnly.slice(0, 7);
}

export function formatMeetingDate(
  dateOnly: string,
): { month: string; day: number } {
  const [, month, day] = dateOnly.split('-').map(Number);
  return { month: MONTH_NAMES[month - 1] ?? '', day };
}

export function weekdayOf(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ??
    '';
}

export function formatClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const [rawHour, rawMinute] = value.split(':');
  const hourValue = Number(rawHour);
  if (Number.isNaN(hourValue)) return null;
  const suffix = hourValue >= 12 ? 'PM' : 'AM';
  const hour = hourValue % 12 === 0 ? 12 : hourValue % 12;
  return `${hour}:${rawMinute ?? '00'} ${suffix}`;
}

export function meetingTimeWindow(meeting: MeetingDetails): string | null {
  if (!meeting.timeLabel) return null;
  if (!meeting.endTimeLabel) return meeting.timeLabel;
  return meeting.timeLabel.slice(-2) === meeting.endTimeLabel.slice(-2)
    ? `${meeting.timeLabel.slice(0, -3)} – ${meeting.endTimeLabel}`
    : `${meeting.timeLabel} – ${meeting.endTimeLabel}`;
}

export function shortHiveName(hiveName: string): string {
  return hiveName.replace(/^Production HIVE$/i, 'Pro HIVE');
}

export function monthlyMeetingSubject(
  kind: Exclude<MonthlyReminderKind, 'midpoint'>,
  hiveName: string,
  meeting: MeetingDetails,
): string {
  const { month, day } = formatMeetingDate(meeting.dateOnly);
  const shortMonth = SHORT_MONTHS[month] ?? month;
  const from = `${shortHiveName(hiveName)} · `;
  const title = (meeting.title.trim() || 'HIVE meeting').replace(/\s+/g, ' ');
  return kind === 'day_of'
    ? `🐝 ${from}${title} tonight (${shortMonth} ${day}) — quick check-in if you haven't`
    : `🐝 ${from}Your check-in is open — ${title} on ${shortMonth} ${day}`;
}

export function monthlyMeetingDedupPeriod(
  kind: Exclude<MonthlyReminderKind, 'midpoint'>,
  meeting: MeetingDetails,
  todayDateOnly: string,
  mode: 'scheduled' | 'force' | 'resend' = 'scheduled',
): string {
  const base = `${
    responsePeriodForMeeting(meeting)
  }:${kind}:${meeting.meetingId}:${meeting.dateOnly}`;
  if (mode === 'resend') return `${base}:resend-${todayDateOnly}`;
  if (mode === 'force') return `${base}:force-${todayDateOnly}`;
  return base;
}

export function personalizeHeldArtifact(
  htmlTemplate: string,
  escapedName: string,
): string {
  // The greeting token is deliberately the first occurrence in generated mail.
  // Replace only that occurrence: event copy is user-authored and must remain
  // byte-for-byte what Nat approved even if it happens to contain this sentinel.
  return htmlTemplate.replace(MEMBER_NAME_TOKEN, escapedName);
}

export function eligibleEmailRecipientCount(
  kind: MonthlyReminderKind,
  profiles: EmailPreferenceProfile[],
): number {
  return profiles.filter((profile) => {
    const wantsKind = kind === 'midpoint'
      ? profile.email_midpoint_checkin_enabled !== false
      : profile.email_meeting_checkin_enabled !== false;
    return profile.email_reminders_enabled !== false && wantsKind &&
      !!profile.email?.trim();
  }).length;
}

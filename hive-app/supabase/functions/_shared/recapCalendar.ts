import type { RecapDateItem } from './meetingRecapContent.ts';

const TIME_ZONE = 'America/Los_Angeles';

export function recapCalendarUrl(baseUrl: string, item: RecapDateItem): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/add-to-calendar`);
  url.searchParams.set('title', item.label);
  url.searchParams.set('date', item.date);
  if (item.time) url.searchParams.set('time', item.time);
  if (item.endTime) url.searchParams.set('end', item.endTime);
  if (item.location) url.searchParams.set('location', item.location);
  if (item.eventId) url.searchParams.set('uid', item.eventId);
  return url.toString();
}

export function recapCalendarChoiceUrl(baseUrl: string, item: RecapDateItem, choice: 'google' | 'apple' | 'outlook'): string {
  const url = new URL(recapCalendarUrl(baseUrl, item));
  if (choice === 'apple') url.searchParams.set('format', 'ics');
  else url.searchParams.set('provider', choice);
  return url.toString();
}

export function readCalendarEvent(url: URL): RecapDateItem | null {
  const title = url.searchParams.get('title')?.trim() ?? '';
  const date = url.searchParams.get('date') ?? '';
  const time = url.searchParams.get('time');
  const endTime = url.searchParams.get('end');
  const location = url.searchParams.get('location')?.trim() ?? '';
  const eventId = url.searchParams.get('uid')?.trim() ?? '';
  if (!title || title.length > 180 || location.length > 300 || eventId.length > 100) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (endTime && (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))) return null;
  return { label: title, date, time, endTime, location, eventId };
}

function compactDate(date: string): string { return date.replace(/-/g, ''); }
function compactTime(time: string): string { return time.replace(':', '') + '00'; }
function nextDay(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function pacificUtc(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wallClock;
  for (let i = 0; i < 2; i++) {
    const zonePart = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(utc)).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = /^GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/.exec(zonePart);
    if (!match) throw new Error(`Unknown Pacific offset: ${zonePart}`);
    const offsetMinutes = match[1] ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
    utc = wallClock - offsetMinutes * 60_000;
  }
  return new Date(utc);
}

function range(item: RecapDateItem) {
  if (!item.time) return { google: `${compactDate(item.date)}/${compactDate(nextDay(item.date))}`, start: item.date, end: nextDay(item.date), allDay: true };
  const start = pacificUtc(item.date, item.time);
  const statedEnd = item.endTime ? pacificUtc(item.date, item.endTime) : null;
  const end = statedEnd && statedEnd > start ? statedEnd : new Date(start.getTime() + 2 * 60 * 60_000);
  const iso = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return { google: `${iso(start)}/${iso(end)}`, start: start.toISOString(), end: end.toISOString(), allDay: false };
}

export function calendarProviderLinks(item: RecapDateItem) {
  const dates = range(item);
  const google = new URL('https://calendar.google.com/calendar/render');
  google.search = new URLSearchParams({ action: 'TEMPLATE', text: item.label, dates: dates.google, ctz: TIME_ZONE, location: item.location ?? '' }).toString();
  const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  outlook.search = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: item.label, startdt: dates.start, enddt: dates.end, ...(dates.allDay ? { allday: 'true' } : {}), location: item.location ?? '' }).toString();
  return { google: google.toString(), outlook: outlook.toString() };
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

export function recapIcs(item: RecapDateItem): string {
  const dates = range(item);
  const uid = /^[a-zA-Z0-9-]{1,100}$/.test(item.eventId ?? '') ? item.eventId : `recap-${compactDate(item.date)}-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const utc = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIVE//Recap Calendar//EN',
    'BEGIN:VEVENT', `UID:${uid}@the-hive.app`, `DTSTAMP:${utc(new Date().toISOString())}`,
    dates.allDay ? `DTSTART;VALUE=DATE:${compactDate(dates.start)}` : `DTSTART:${utc(dates.start)}`,
    dates.allDay ? `DTEND;VALUE=DATE:${compactDate(dates.end)}` : `DTEND:${utc(dates.end)}`,
    `SUMMARY:${icsEscape(item.label)}`, `LOCATION:${icsEscape(item.location ?? '')}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

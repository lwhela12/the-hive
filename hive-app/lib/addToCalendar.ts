import { Alert, Linking } from 'react-native';
import type { Event } from '../types';

// Falls back to a 2-hour meeting when an event has no end_time of its own —
// most events do, so this only decides the length of an old or hand-typed
// row that never got one.
const CALENDAR_DURATION_MS = 2 * 60 * 60 * 1000;

const getEventStartDate = (event: Event) => {
  const [year, month, day] = event.event_date.split('-').map(Number);
  const [hour = 9, minute = 0] = (event.event_time || '09:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
};

// Reads the event's own end_time when it has one, rather than always adding
// the fallback duration — a meeting saved as 5:00-7:00 PM must export as
// 5:00-7:00 PM, not 5:00-7:30.
const getEventEndDate = (event: Event, start: Date) => {
  if (event.end_time) {
    const [year, month, day] = event.event_date.split('-').map(Number);
    const [hour, minute = 0] = event.end_time.split(':').map(Number);
    const end = new Date(year, month - 1, day, hour, minute);
    if (end.getTime() > start.getTime()) return end;
  }
  return new Date(start.getTime() + CALENDAR_DURATION_MS);
};

const formatGoogleCalendarDate = (date: Date) => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const formatIcsDate = (date: Date) => formatGoogleCalendarDate(date);

// Time-less events export as all-day calendar entries spanning event_date
// through end_date (calendar end dates are exclusive, hence the +1 day).
const isAllDayEvent = (event: Event) => !event.event_time;

const formatAllDayDate = (date: Date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

const getAllDayRange = (event: Event) => {
  const [startYear, startMonth, startDay] = event.event_date.split('-').map(Number);
  const [endYear, endMonth, endDay] = (event.end_date || event.event_date).split('-').map(Number);
  return {
    start: new Date(startYear, startMonth - 1, startDay),
    endExclusive: new Date(endYear, endMonth - 1, endDay + 1),
  };
};

const escapeIcsText = (value = '') => value
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\n/g, '\\n');

const getCalendarDescription = (event: Event) => {
  return [
    event.description,
    event.meet_link ? `Join Google Meet: ${event.meet_link}` : null,
  ].filter(Boolean).join('\n\n');
};

const createCalendarLinks = (event: Event) => {
  const allDay = isAllDayEvent(event);
  const allDayRange = getAllDayRange(event);
  const start = getEventStartDate(event);
  const end = getEventEndDate(event, start);
  const description = getCalendarDescription(event);

  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: allDay
      ? `${formatAllDayDate(allDayRange.start)}/${formatAllDayDate(allDayRange.endExclusive)}`
      : `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(end)}`,
    details: description,
    location: event.location || '',
  });

  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: allDay ? event.event_date : start.toISOString(),
    enddt: allDay
      ? `${allDayRange.endExclusive.getFullYear()}-${String(allDayRange.endExclusive.getMonth() + 1).padStart(2, '0')}-${String(allDayRange.endExclusive.getDate()).padStart(2, '0')}`
      : end.toISOString(),
    ...(allDay ? { allday: 'true' } : {}),
    body: description,
    location: event.location || '',
  });

  return {
    google: `https://calendar.google.com/calendar/render?${googleParams.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`,
  };
};

const createIcsContent = (event: Event) => {
  const allDay = isAllDayEvent(event);
  const allDayRange = getAllDayRange(event);
  const start = getEventStartDate(event);
  const end = getEventEndDate(event, start);
  const timestamp = formatIcsDate(new Date());
  const uid = `${event.id}@the-hive.app`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HIVE//Community Event//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    allDay
      ? `DTSTART;VALUE=DATE:${formatAllDayDate(allDayRange.start)}`
      : `DTSTART:${formatIcsDate(start)}`,
    allDay
      ? `DTEND;VALUE=DATE:${formatAllDayDate(allDayRange.endExclusive)}`
      : `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(getCalendarDescription(event))}`,
    `LOCATION:${escapeIcsText(event.location || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

const downloadIcsFile = (event: Event) => {
  const icsContent = createIcsContent(event);
  const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hive-event';
  const fileName = `${safeTitle}.ics`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const dataUrl = `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`;
  Linking.openURL(dataUrl);
};

/**
 * The one "Add to Calendar" action for any HIVE event — the meeting card on a
 * HIVE's own Meetings screen and the event card on Home both call this rather
 * than each carrying their own copy (a second copy is how the "always adds
 * 2.5 hours" bug went unnoticed on one of the two screens).
 */
export const openAddToCalendar = (event: Event) => {
  const links = createCalendarLinks(event);

  if (typeof window !== 'undefined' && window.confirm) {
    if (window.confirm('Open Google Calendar? Press Cancel to download a calendar file instead.')) {
      Linking.openURL(links.google);
    } else {
      downloadIcsFile(event);
    }
    return;
  }

  // The last raw `Alert.alert` here, and it is safe: the browser path returns
  // above, so only a phone reaches here. It offers three choices, which
  // `confirmAction` (a yes or no) cannot carry.
  Alert.alert('Add to Calendar', event.title, [
    { text: 'Google Calendar', onPress: () => Linking.openURL(links.google) },
    { text: 'Outlook Calendar', onPress: () => Linking.openURL(links.outlook) },
    { text: 'Apple / Other Calendar', onPress: () => downloadIcsFile(event) },
    { text: 'Cancel', style: 'cancel' },
  ]);
};

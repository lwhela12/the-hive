import { calendarProviderLinks, readCalendarEvent, recapCalendarChoiceUrl, recapCalendarUrl, recapIcs } from './recapCalendar.ts';

Deno.test('recap calendar offers an email-safe chooser without HIVE sign-in', () => {
  const url = new URL(recapCalendarUrl('https://project.example/functions/v1', {
    eventId: 'event-1', label: 'Tech HIVE — Nov', date: '2026-11-19', time: '17:00', location: 'Las Vegas',
  }));
  if (url.pathname !== '/functions/v1/add-to-calendar') throw new Error('wrong calendar route');
  const item = readCalendarEvent(url);
  if (!item || item.label !== 'Tech HIVE — Nov') throw new Error('calendar item did not round-trip');
  const links = calendarProviderLinks(item);
  if (!new URL(links.google).searchParams.get('dates')?.startsWith('20261120T010000Z/')) {
    throw new Error('November event did not convert from Pacific Standard Time');
  }
  if (!recapIcs(item).includes('DTSTART:20261120T010000Z')) throw new Error('Apple calendar UTC time is wrong');
  if (!recapCalendarChoiceUrl('https://project.example/functions/v1', item, 'apple').includes('format=ics')) throw new Error('Apple choice is not an ICS download');
});

Deno.test('recap calendar handles Pacific Daylight Time and rejects bad dates', () => {
  const item = { label: 'Vegas Link Up', date: '2026-10-28', time: '11:00', location: '6543 S Las Vegas Blvd' };
  if (!recapIcs(item).includes('DTSTART:20261028T180000Z')) throw new Error('October daylight time is wrong');
  if (readCalendarEvent(new URL('https://example.com?title=X&date=2026-02-30'))) throw new Error('impossible date accepted');
  if (readCalendarEvent(new URL('https://example.com?title=X&date=2026-10-28&time=25:00'))) throw new Error('invalid time accepted');
});

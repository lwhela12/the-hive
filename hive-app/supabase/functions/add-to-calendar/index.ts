import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { calendarProviderLinks, readCalendarEvent, recapIcs } from '../_shared/recapCalendar.ts';

serve((request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  let event;
  try { event = readCalendarEvent(url); } catch { event = null; }
  if (!event) return new Response('Invalid calendar event', { status: 400 });

  if (url.searchParams.get('format') === 'ics') {
    return new Response(recapIcs(event), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="hive-event.ics"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const { google, outlook } = calendarProviderLinks(event);
  const target = url.searchParams.get('provider') === 'outlook' ? outlook : google;
  return Response.redirect(target, 302);
});

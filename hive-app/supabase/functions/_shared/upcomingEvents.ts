/** Shared visibility and date rules for the signed-in calendar and public Buzz. */
export type UpcomingEvent = {
  title?: string | null; event_date: string; end_date?: string | null;
  event_type?: string | null; visibility?: string | null; invited_scope?: string | null;
  community?: { slug?: string | null } | { slug?: string | null }[] | null;
};

export function pacificDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

export function upcomingWindow(today: string): { start: string; end: string } {
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 45 * 86400000).toISOString().slice(0, 10);
  return { start: today, end };
}

export function isHiveWideEventScope(event: { visibility?: string | null }): boolean {
  return event.visibility === 'all_hives' || event.visibility === 'public';
}

export function eligibleUpcomingEvent(event: UpcomingEvent, audience: 'hive_wide' | 'public', today: string, end: string): boolean {
  const source = Array.isArray(event.community) ? event.community[0] : event.community;
  if (source?.slug === 'show' || event.event_date > end || (event.end_date ?? event.event_date) < today) return false;
  if (/\b(out of town|away|trip|travel|galavant)\b/i.test(event.title ?? '')) return false;
  if (audience === 'public') return event.visibility === 'public' && event.invited_scope === 'public'
    && event.event_type !== 'meeting' && event.event_type !== 'birthday';
  return isHiveWideEventScope(event);
}

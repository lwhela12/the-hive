import { eligibleUpcomingEvent, upcomingWindow } from '../supabase/functions/_shared/upcomingEvents';

export type BuzzCalendarItem = {
  id: string; title: string; event_date: string; event_time?: string | null; end_time?: string | null;
  event_type: string; end_date?: string | null; community_id?: string; visibility?: string;
  invited_scope?: string | null; community?: { slug?: string | null } | null;
};

/** One shared check-in: include the next visible OG meeting day. */
export function surveyCalendarWindow(today: string, meetings: BuzzCalendarItem[]) {
  const nextMeeting = meetings.filter(row => row.community?.slug === 'default' && row.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
  const fallback = upcomingWindow(today);
  return { start: today, end: nextMeeting?.event_date ?? fallback.end, meetingDate: nextMeeting?.event_date ?? null };
}

/** Shared events and canonical private events from one's own OG/Tech HIVE. */
export function eligibleSurveyEvent(event: BuzzCalendarItem, memberCommunityIds: string[], today: string, end: string): boolean {
  if (event.community?.slug !== 'default' && event.community?.slug !== 'tech') return false;
  if (eligibleUpcomingEvent(event, 'hive_wide', today, end)) return true;
  return event.visibility === 'members' && !!event.community_id && memberCommunityIds.includes(event.community_id)
    && eligibleUpcomingEvent({ ...event, visibility: 'all_hives' }, 'hive_wide', today, end);
}

/** Visibility is not an invitation: a HIVE-Wide meeting may invite only Tech. */
export function surveyEventVisibilityLabel(event: BuzzCalendarItem): string {
  if (event.visibility === 'public') return 'Public';
  if (event.visibility === 'all_hives') return 'HIVE-Wide';
  return event.community?.slug === 'tech' ? 'Tech HIVE' : 'OG HIVE';
}

/** Calendar context is a suggestion, never a claim that an item was approved. */
export function buzzCalendarItems(events: BuzzCalendarItem[], birthdays: { id: string; name: string; birthday: string }[], month?: string) {
  const byId = new Map<string, BuzzCalendarItem>();
  for (const event of events) {
    if ((month && !event.event_date.startsWith(month)) || /\b(out of town|away|trip|travel|galavant)/i.test(event.title)) continue;
    byId.set(event.id, event);
  }
  for (const person of birthdays) {
    if (!month) break;
    const monthDay = person.birthday?.slice(5, 10);
    if (!monthDay || monthDay.slice(0, 2) !== month.slice(5, 7)) continue;
    // Do not show a profile birthday twice if an actual event already exists.
    if ([...byId.values()].some(event => event.event_type === 'birthday' && event.title.toLowerCase().includes(person.name.toLowerCase()))) continue;
    byId.set(`birthday:${person.id}`, { id: `birthday:${person.id}`, title: `${person.name}’s birthday`, event_date: `${month.slice(0, 4)}-${monthDay}`, event_type: 'birthday' });
  }
  return [...byId.values()].sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time ?? '').localeCompare(b.event_time ?? '') || a.title.localeCompare(b.title));
}

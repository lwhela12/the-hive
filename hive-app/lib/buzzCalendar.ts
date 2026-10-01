import { upcomingWindow } from '../supabase/functions/_shared/upcomingEvents';

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

/** Shared meetings and one's own OG/Tech meetings can appear in the personal survey. */
export function eligibleSurveyMeeting(event: BuzzCalendarItem, memberCommunityIds: string[], today: string, end: string): boolean {
  return event.event_type === 'meeting'
    && (event.community?.slug === 'default' || event.community?.slug === 'tech')
    && event.event_date >= today && event.event_date <= end
    && ((!!event.community_id && memberCommunityIds.includes(event.community_id))
      || event.visibility === 'all_hives' || event.visibility === 'public');
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

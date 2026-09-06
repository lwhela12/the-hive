export type BuzzCalendarItem = {
  id: string; title: string; event_date: string; event_time?: string | null; end_time?: string | null;
  event_type: string; end_date?: string | null; community_id?: string; visibility?: string;
};

/** Calendar context is a suggestion, never a claim that an item was approved. */
export function buzzCalendarItems(events: BuzzCalendarItem[], birthdays: { id: string; name: string; birthday: string }[], month: string) {
  const byId = new Map<string, BuzzCalendarItem>();
  for (const event of events) {
    if (!event.event_date.startsWith(month) || /\b(out of town|away|trip|travel|galavant)/i.test(event.title)) continue;
    byId.set(event.id, event);
  }
  for (const person of birthdays) {
    const monthDay = person.birthday?.slice(5, 10);
    if (!monthDay || monthDay.slice(0, 2) !== month.slice(5, 7)) continue;
    // Do not show a profile birthday twice if an actual event already exists.
    if ([...byId.values()].some(event => event.event_type === 'birthday' && event.title.toLowerCase().includes(person.name.toLowerCase()))) continue;
    byId.set(`birthday:${person.id}`, { id: `birthday:${person.id}`, title: `${person.name}’s birthday`, event_date: `${month.slice(0, 4)}-${monthDay}`, event_type: 'birthday' });
  }
  return [...byId.values()].sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time ?? '').localeCompare(b.event_time ?? '') || a.title.localeCompare(b.title));
}

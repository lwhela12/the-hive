export type StoryWish = { id: string; user_id: string; description: string; status?: string | null; is_active?: boolean | null; is_spotlight?: boolean | null };
export type StoryTask = { id: string; description: string; assigned_to: string | null; related_wish_id: string | null; completed: boolean; completed_at: string | null; created_at?: string; related_user_id?: string | null };
export const wishIdentity = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** The submitted selection wins. Never fill an unanswered/retired choice with other wishes. */
export function meetingFocus<T extends StoryWish>(wishes: T[], selectedId: unknown, selectedText: string, hasCheckIn: boolean): T | null {
  const live = wishes.filter(w => w.status === 'public' && w.is_active !== false);
  if (typeof selectedId === 'string' && selectedId) return live.find(w => w.id === selectedId) ?? null;
  if (selectedText.trim()) return live.find(w => wishIdentity(w.description) === wishIdentity(selectedText)) ?? null;
  return hasCheckIn ? null : live.find(w => w.is_spotlight) ?? null;
}
/** One group per actual step, regardless of how many helpers it was assigned to. */
export function compactWishSteps(tasks: StoryTask[], wishId: string | undefined, since: string) {
  const linked = wishId ? tasks.filter(t => t.related_wish_id === wishId) : [];
  const groups = new Map<string, { description: string; helpers: Set<string> }>();
  for (const task of linked.filter(t => !t.completed)) {
    const key = wishIdentity(task.description.replace(/[(]re:[^)]*[)]/gi, '').replace(/^(@[\w.-]+[\s,]*)+/, ''));
    const group = groups.get(key) ?? { description: task.description, helpers: new Set<string>() };
    if (task.assigned_to) group.helpers.add(task.assigned_to);
    groups.set(key, group);
  }
  return { next: [...groups.values()][0] ?? null, completed: linked.filter(t => t.completed && !!t.completed_at && t.completed_at >= since).length };
}

/** A month of reminders, grouped by action; unchecked promises stay visibly open. */
export function monthlyHelp(tasks: StoryTask[], memberId: string, since: string) {
  const recent = tasks.filter(t => t.completed ? !!t.completed_at && t.completed_at >= since : !!t.created_at && t.created_at >= since);
  function group(direction: 'given' | 'received') {
    const rows = recent.filter(t => direction === 'given'
      ? t.assigned_to === memberId && t.related_user_id && t.related_user_id !== memberId
      : t.related_user_id === memberId && t.assigned_to && t.assigned_to !== memberId);
    const grouped = new Map<string, { description: string; completed: boolean; people: Set<string> }>();
    for (const row of rows) {
      const description = row.description.replace(/\s*[(]re:[^)]*[)]/gi, '').replace(/^(@[\w.-]+[\s,]*)+/, '').trim();
      const key = `${row.completed}:${wishIdentity(description)}`;
      const value = grouped.get(key) ?? { description, completed: row.completed, people: new Set<string>() };
      value.people.add((direction === 'given' ? row.related_user_id : row.assigned_to)!);
      grouped.set(key, value);
    }
    return [...grouped.values()].sort((a,b) => Number(b.completed)-Number(a.completed));
  }
  return { given: group('given'), received: group('received') };
}
export function precedingPeriod(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2])-2, 1));
  return date.toISOString().slice(0,7);
}

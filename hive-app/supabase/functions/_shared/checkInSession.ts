// Shared by the form and reminder. An occurrence is a meeting, not its month.
export type CheckInMeeting = { id: string; community_id: string; event_date: string };
export type CheckInCompletion = { user_id: string; community_id: string | null; occurrence: string };
export const meetingOccurrence = (eventId: string) => `meeting:${eventId}`;
export const reminderKey = (_kind: string, userId: string, day: string) => `check-in:${userId}:${day}`;
export function scopeAnswers(answers: Record<string, unknown>, communityId: string) {
  return Object.fromEntries(Object.entries(answers).filter(([key]) => key.startsWith(`${communityId}:`)).map(([key, value]) => [key.slice(communityId.length + 1), value]));
}
export function waitingForCheckIn(
  memberships: {user_id: string; community_id: string}[],
  meetings: CheckInMeeting[],
  completed: CheckInCompletion[],
  month: string,
): string[] {
  const done = new Set(completed.map(r => `${r.user_id}|${r.community_id ?? ''}|${r.occurrence}`));
  return [...new Set(memberships.filter(m => meetings.length
    ? meetings.some(event => event.community_id === m.community_id && !done.has(`${m.user_id}|${m.community_id}|${meetingOccurrence(event.id)}`))
    : !done.has(`${m.user_id}||month:${month}`)
  ).map(m => m.user_id))];
}

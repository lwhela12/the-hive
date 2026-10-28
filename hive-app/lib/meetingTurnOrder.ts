import type { ArrivalAttendance } from './arrivalSurveySelection';

/** In-room voices first, remote attendees next, unconfirmed then absentees. */
export function meetingTurnOrder<T extends { id: string }>(members: T[], attendance: (id: string) => ArrivalAttendance, submitted: (id: string) => string, leaderId?: string) {
  const rank: Record<ArrivalAttendance, number> = { in_person: 0, remote: 1, unknown: 2, missing: 3 };
  return [...members].sort((a, b) => rank[attendance(a.id)] - rank[attendance(b.id)]
    || Number(b.id === leaderId) - Number(a.id === leaderId)
    || (submitted(a.id) || '9999').localeCompare(submitted(b.id) || '9999'));
}

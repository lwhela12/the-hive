type ArrivalSurveyScope = {
  community_id?: string | null;
};

export type ArrivalAttendance = 'in_person' | 'remote' | 'missing' | 'unknown';

export function getArrivalAttendance(answers?: Record<string, unknown>): ArrivalAttendance {
  const raw = String(answers?.q_attendance ?? '').toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('miss') || raw.includes("can't") || raw.includes('cant')) return 'missing';
  if (
    raw.includes('remote')
    || raw.includes('joining')
    || raw.includes('zoom')
    || raw.includes('on the call')
  ) return 'remote';
  return 'in_person';
}

/**
 * The merged Before we meet form is the live source of truth. During the
 * changeover an older HIVE-specific check-in can still be active, so choose
 * the shared form first and keep the older row only as a fallback.
 */
export function selectActiveArrivalCheckIn<T extends ArrivalSurveyScope>(
  surveys: T[],
  communityId: string,
  isArrivalCheckIn: (survey: T) => boolean,
): T | null {
  const shared = surveys.find(
    (survey) => survey.community_id == null && isArrivalCheckIn(survey),
  );
  if (shared) return shared;

  return surveys.find(
    (survey) => survey.community_id === communityId && isArrivalCheckIn(survey),
  ) ?? null;
}

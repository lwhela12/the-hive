import type { SurveyAnswers } from './hooks/useSurveys';

export interface CheckInHistory {
  id: string;
  community_id: string | null;
  response_period: string | null;
  submitted_at: string | null;
  answers: SurveyAnswers;
}

/** A shared legacy payload may contain scoped keys. Only an exact HIVE prefix
 * is unwrapped; a month, timestamp or survey due date never identifies a meeting. */
export function transitionAnswers(row: CheckInHistory, communityId: string | null): SurveyAnswers | null {
  if (row.community_id !== null && row.community_id !== communityId) return null;
  const result: SurveyAnswers = {};
  for (const [key, value] of Object.entries(row.answers ?? {})) {
    if (!key.includes(':') && key !== 'perHive' && row.community_id === communityId) result[key] = value;
    else if (communityId && key.startsWith(`${communityId}:`)) result[key.slice(communityId.length + 1)] = value;
  }
  // Some older merged forms stored perHive as JSON, rather than scoped keys.
  const perHive = row.answers?.perHive;
  if (communityId && perHive && typeof perHive === 'object' && !Array.isArray(perHive)) {
    const own = (perHive as Record<string, unknown>)[communityId];
    if (own && typeof own === 'object' && !Array.isArray(own)) Object.assign(result, own);
  }
  return Object.keys(result).length ? result : null;
}

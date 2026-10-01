/** The owner-only mail button must refuse any dry run that includes another person. */
export function isOwnMonthEmailPreview(
  value: unknown, surveyId: string, reviewPeriod: string,
): value is { survey_id: string; mode: 'self_only'; members: 1; would_reach: 1; review_period: string; meeting_now: false } {
  if (!value || typeof value !== 'object') return false;
  const preview = value as Record<string, unknown>;
  return preview.survey_id === surveyId
    && preview.mode === 'self_only'
    && preview.members === 1
    && preview.would_reach === 1
    && preview.review_period === reviewPeriod
    && preview.meeting_now === false;
}

/** A notification count is not proof that mail reached the sender's account. */
export function wasOwnMonthEmailSent(value: unknown, surveyId: string, reviewPeriod: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.survey_id === surveyId
    && result.mode === 'self_only'
    && result.review_period === reviewPeriod
    && result.emailed === 1
    && result.claimed === 1;
}

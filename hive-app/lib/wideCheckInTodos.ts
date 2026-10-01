import { endOfMonthContext, isEndOfMonthReviewOpen } from './endOfMonthPeriod';

export type MonthReceipt = { survey_id: string; community_id: string | null; occurrence: string };
export type MonthResponse = { survey_id: string; community_id: string | null; response_period: string | null };

function completedPeriods(surveyId: string, receipts: MonthReceipt[], responses: MonthResponse[], through: string): string[] {
  return [
    ...receipts.filter(row => row.survey_id === surveyId && row.community_id === null && /^month:\d{4}-(0[1-9]|1[0-2])$/.test(row.occurrence))
      .map(row => row.occurrence.slice(6)),
    ...responses.filter(row => row.survey_id === surveyId && row.community_id === null && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.response_period ?? ''))
      .map(row => row.response_period!),
  ].filter(value => value <= through).sort().reverse();
}

/** Keep the latest saved month accessible in Done while the next month opens. */
export function wideCompletedMonthTodo(
  survey: { id: string; title: string }, receipts: MonthReceipt[], eligible: boolean, now: Date,
  responses: MonthResponse[] = [],
) {
  if (!eligible) return null;
  const current = endOfMonthContext(now).period;
  const period = completedPeriods(survey.id, receipts, responses, current).find(value => value !== current);
  if (!period) return null;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const due = new Date(year, month, 0, 12);
  return {
    id: `month:${survey.id}:${period}`,
    title: `${survey.title} · ${due.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`,
    due_date: `${period}-${String(due.getDate()).padStart(2, '0')}`,
    done: true,
    destination: `/endofmonth?review=${period}` as const,
  };
}

/** The shared receipt is written last, after every eligible HIVE section. */
export function wideMonthTodo(
  survey: { id: string; title: string }, receipts: MonthReceipt[], eligible: boolean, now: Date,
  responses: MonthResponse[] = [],
) {
  if (!eligible) return null;
  const open = isEndOfMonthReviewOpen(now);
  const context = endOfMonthContext(now);
  if (!open) return wideCompletedMonthTodo(survey, receipts, eligible, now, responses);
  const { period, reviewDate } = context;
  const occurrence = `month:${period}`;
  const dueDate = new Date(reviewDate.getFullYear(), reviewDate.getMonth() + 1, 0);
  return {
    id: `month:${survey.id}:${period}`,
    title: survey.title,
    due_date: `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`,
    done: receipts.some(row => row.survey_id === survey.id && row.community_id === null && row.occurrence === occurrence)
      || responses.some(row => row.survey_id === survey.id && row.community_id === null && row.response_period === period),
    destination: '/endofmonth' as const,
  };
}

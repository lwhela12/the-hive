import type { SurveyQuestion } from '../types';

export const QUARTER_PULSE_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'q_quarter_helping',
    text: 'Is HIVE helping you move toward what matters to you?',
    type: 'choice',
    options: ['Yes', 'A little', 'Not yet', 'Not sure'],
    required: false,
  },
  {
    id: 'q_quarter_help_next',
    text: 'What do you need from HIVE to nudge your 3 Most Important Questions (3MIQ), or any other goals, forward?',
    type: 'choice',
    options: ['A gentle nudge', 'Time to work together', 'Ideas or connections', 'More connection and fun', 'Something else', 'Nothing extra right now'],
    required: false,
  },
];

export const OG_QUARTER_PULSE_QUESTIONS = QUARTER_PULSE_QUESTIONS.filter(question => question.id === 'q_quarter_helping');
export const SHARED_QUARTER_PULSE_QUESTION = QUARTER_PULSE_QUESTIONS.find(question => question.id === 'q_quarter_help_next')!;

/** The reviewed month is already moved back during the first seven Pacific days. */
export function isQuarterPulseOpen(reviewDate: Date): boolean {
  const month = reviewDate.getMonth();
  const last = new Date(reviewDate.getFullYear(), month + 1, 0).getDate();
  return month % 3 === 2 && reviewDate.getDate() >= last - 3;
}

/** Prefer the one shared answer; older OG rows remain readable without double counting. */
export function quarterAnswersForMembers(
  memberIds: string[], question: SurveyQuestion,
  sharedRows: { user_id: string; answers: Record<string, unknown> }[],
  legacyHiveRows: { user_id: string; answers: Record<string, unknown> }[] = [],
): Record<string, unknown>[] {
  const shared = new Map(sharedRows.map(row => [row.user_id, row.answers]));
  const legacy = new Map(legacyHiveRows.map(row => [row.user_id, row.answers]));
  return [...new Set(memberIds)].map(id => ({
    [question.id]: shared.get(id)?.[question.id] ?? legacy.get(id)?.[question.id],
  }));
}

export function tallyQuarterPulse(answers: Record<string, unknown>[], question: SurveyQuestion) {
  const counts = (question.options ?? []).map(option => ({ option, count: answers.filter(answer => answer[question.id] === option).length }));
  const answered = counts.reduce((sum, row) => sum + row.count, 0);
  return { answered, rows: counts.map(row => ({ ...row, percent: answered ? Math.round(row.count * 100 / answered) : 0 })) };
}

/** Show the latest quarter's counts at its meeting, without an old tally lingering. */
export function recentQuarterPulsePeriod(pacificDate: Date): string | null {
  const month = pacificDate.getMonth() + 1;
  const quarterEnd = month === 3 || month === 4 ? 3 : month === 6 || month === 7 ? 6 : month === 9 || month === 10 ? 9 : null;
  return quarterEnd ? `${pacificDate.getFullYear()}-${String(quarterEnd).padStart(2, '0')}` : null;
}

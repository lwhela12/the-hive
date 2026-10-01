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
    text: 'What would help you most next quarter?',
    type: 'choice',
    options: ['A gentle nudge', 'Time to work together', 'Ideas or connections', 'More connection and fun', 'Something else', 'Nothing extra right now'],
    required: false,
  },
];

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

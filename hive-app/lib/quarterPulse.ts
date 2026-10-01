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

export function quarterPulseQuestionsForDeck(slug: string): SurveyQuestion[] {
  if (slug === 'default') return [...OG_QUARTER_PULSE_QUESTIONS, SHARED_QUARTER_PULSE_QUESTION];
  if (slug === 'tech') return [SHARED_QUARTER_PULSE_QUESTION];
  return [];
}

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

/** Counts returned by the membership-checked RPC. No response or member IDs reach the client. */
export type QuarterPulseCount = { question_id: string; option: string; response_count: number };

export function quarterPulseTalkingPoints(counts: QuarterPulseCount[], question: SurveyQuestion) {
  const rows = (question.options ?? []).map(option => {
    const value = Number(counts.find(row => row.question_id === question.id && row.option === option)?.response_count ?? 0);
    return { option, count: Number.isFinite(value) ? Math.max(0, value) : 0 };
  });
  const answered = rows.reduce((total, row) => total + row.count, 0);
  const lead = Math.max(...rows.map(row => row.count));
  return answered === 0 ? [] : rows.filter(row => row.count === lead).map(row => ({
    option: row.option,
    answered,
    percent: Math.round(row.count * 100 / answered),
  }));
}

/** Keep unanswered questions visible in the meeting, without inventing a percentage. */
export function quarterPulseDeckLines(counts: QuarterPulseCount[], slug: string): {
  question: SurveyQuestion; point: ReturnType<typeof quarterPulseTalkingPoints>[number] | null;
}[] {
  return quarterPulseQuestionsForDeck(slug).flatMap((question): {
    question: SurveyQuestion; point: ReturnType<typeof quarterPulseTalkingPoints>[number] | null;
  }[] => {
    const points = quarterPulseTalkingPoints(counts, question);
    return points.length ? points.map(point => ({ question, point })) : [{ question, point: null }];
  });
}

/** Show the latest quarter's counts at its meeting, without an old tally lingering. */
export function recentQuarterPulsePeriod(pacificDate: Date): string | null {
  const month = pacificDate.getMonth() + 1;
  const quarterEnd = month === 3 || month === 4 ? 3 : month === 6 || month === 7 ? 6 : month === 9 || month === 10 ? 9 : null;
  return quarterEnd ? `${pacificDate.getFullYear()}-${String(quarterEnd).padStart(2, '0')}` : null;
}

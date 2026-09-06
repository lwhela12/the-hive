import { CARRY_FORWARD_ANSWER_KEY, normalizeCarryForwardResponse, type CarryForwardItem, type CarryForwardResponseItem } from './carryForward';
import type { SurveyAnswers } from './hooks/useSurveys';

export type EndOfMonthAnswers = { hives: Record<string, SurveyAnswers>; month: SurveyAnswers };

/** Keep saved answers and older per-section drafts when moving to one form. */
export function restoreEndOfMonthAnswers(
  communityIds: string[], receipts: Record<string, SurveyAnswers>, drafts: Record<string, SurveyAnswers>,
): EndOfMonthAnswers {
  const month = { ...receipts.month, ...drafts.month };
  // Both legacy newsletter keys are read by The Buzz. Consolidate the old
  // combined box into the current plug/event field so it is not read twice.
  const newsletter = [month.q_newsletter, month.q_eom_newsletter]
    .filter((value): value is string => typeof value === 'string' && !!value.trim());
  month.q_newsletter = [...new Set(newsletter)].join('\n\n');
  delete month.q_eom_newsletter;
  return { month, hives: Object.fromEntries(communityIds.map(id => [id, { ...receipts[id], ...drafts[id] }])) };
}

/** Only current assigned tasks may be changed; stale drafts cannot revive a task. */
export function endOfMonthTaskResponses(items: CarryForwardItem[], answers: SurveyAnswers): CarryForwardResponseItem[] {
  const previous = normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY]);
  return items.filter(item => item.type === 'action_item').map(item => {
    const saved = previous.find(entry => entry.type === item.type && entry.id === item.id);
    return { ...item, status: saved?.status ?? 'keep_active', note: saved?.note ?? null };
  });
}

/** One button, separate HIVE storage; the shared completion is written last. */
export async function saveEndOfMonth({ answers, communityIds, todos, applyTasks, save }: {
  answers: EndOfMonthAnswers;
  communityIds: string[];
  todos: Record<string, CarryForwardItem[]>;
  applyTasks: (items: CarryForwardResponseItem[]) => Promise<{ error: unknown }>;
  save: (communityId: string | null, answers: SurveyAnswers) => Promise<{ error: unknown }>;
}): Promise<{ error: string | null }> {
  try {
    const perHive = communityIds.map(id => {
      const own: SurveyAnswers = { ...answers.hives[id], [CARRY_FORWARD_ANSWER_KEY]: endOfMonthTaskResponses(todos[id] ?? [], answers.hives[id] ?? {}).map(item => ({ ...item })) };
      // Newsletter material belongs in the one shared row, never once per HIVE.
      for (const key of ['q_newsletter', 'q_eom_newsletter', 'q_shoutout']) delete own[key];
      return { id, answers: own };
    });
    const tasks = await applyTasks(perHive.flatMap(hive => normalizeCarryForwardResponse(hive.answers[CARRY_FORWARD_ANSWER_KEY])));
    if (tasks.error) return { error: 'Your to-do updates could not be confirmed. Your draft is still here; please try again.' };
    for (const hive of perHive) {
      const result = await save(hive.id, hive.answers);
      if (result.error) return { error: 'Some of your check-in could not save. Your draft is still here; please try again.' };
    }
    const result = await save(null, answers.month);
    return { error: result.error ? 'Your Buzz answers could not save. Your draft is still here; please try again.' : null };
  } catch {
    return { error: 'Your check-in could not finish saving. Your draft is still here; please try again.' };
  }
}

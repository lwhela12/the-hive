export type SurveyBranchCondition = { question_id: string; equals: string };
export function getVisibleSurveyQuestions<T extends { id: string; show_if?: SurveyBranchCondition }>(
  questions: T[],
  answers?: Record<string, any>,
): T[];
export function pruneHiddenSurveyAnswers<T extends { id: string; show_if?: SurveyBranchCondition }>(
  questions: T[],
  answers?: Record<string, any>,
): Record<string, any>;
export function validateSurveyQuestionBranches(
  questions: Array<{ id: string; type: string; options?: string[]; show_if?: SurveyBranchCondition }>,
): string[];

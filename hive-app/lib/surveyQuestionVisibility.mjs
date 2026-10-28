export function getVisibleSurveyQuestions(questions, answers = {}) {
  return questions.filter((question) => {
    const condition = question.show_if;
    return !condition || answers[condition.question_id] === condition.equals;
  });
}

export function pruneHiddenSurveyAnswers(questions, answers = {}) {
  const visibleIds = new Set(getVisibleSurveyQuestions(questions, answers).map((question) => question.id));
  const next = { ...answers };
  for (const question of questions) {
    if (!visibleIds.has(question.id)) delete next[question.id];
  }
  return next;
}

export function validateSurveyQuestionBranches(questions) {
  const seen = new Map();
  const errors = [];
  questions.forEach((question) => {
    if (!question.show_if) {
      seen.set(question.id, { question });
      return;
    }
    const parent = seen.get(question.show_if.question_id);
    if (!parent) errors.push('A conditional question must follow its controlling question.');
    else if (parent.question.type !== 'choice' || parent.question.show_if) errors.push('Branching must depend on an earlier, unbranched choice question.');
    else if (!(parent.question.options || []).includes(question.show_if.equals)) errors.push('The selected branch answer must exist on its controlling choice question.');
    seen.set(question.id, { question });
  });
  return [...new Set(errors)];
}

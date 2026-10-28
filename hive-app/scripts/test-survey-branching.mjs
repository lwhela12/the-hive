import assert from 'node:assert/strict';
import { getVisibleSurveyQuestions, pruneHiddenSurveyAnswers, validateSurveyQuestionBranches } from '../lib/surveyQuestionVisibility.mjs';
const questions = [
  { id: 'ball', type: 'choice', options: ['Committee can choose', 'I would like to give input'] },
  { id: 'timing', type: 'long', show_if: { question_id: 'ball', equals: 'I would like to give input' } },
  { id: 'goals', type: 'long' },
];
assert.deepEqual(getVisibleSurveyQuestions(questions, { ball: 'Committee can choose', timing: 'old answer' }).map(q => q.id), ['ball', 'goals']);
assert.deepEqual(pruneHiddenSurveyAnswers(questions, { ball: 'Committee can choose', timing: 'old answer', goals: 'help', __carry_forward: [] }), { ball: 'Committee can choose', goals: 'help', __carry_forward: [] });
assert.deepEqual(getVisibleSurveyQuestions(questions, { ball: 'I would like to give input' }).map(q => q.id), ['ball', 'timing', 'goals']);
assert.deepEqual(validateSurveyQuestionBranches(questions), []);
assert.ok(validateSurveyQuestionBranches([{ id: 'child', type: 'long', show_if: { question_id: 'missing', equals: 'x' } }]).length);
console.log('Survey branch visibility checks passed.');

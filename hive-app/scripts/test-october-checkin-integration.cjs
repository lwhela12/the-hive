const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const load = (file, requireStub) => {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: m, exports: m.exports, require: requireStub, Date, Intl, Map, Set });
  return m.exports;
};
const clothing = load('lib/clothingInterest.ts', () => ({}));
const draft = load('lib/octoberOgQuestions.ts', id => id === './clothingInterest' ? clothing : {});
const checks = load('lib/checkIns.ts', id => id === './hiveBrand' ? { hiveDisplayName: value => value } : { OG_QUARTER_PULSE_QUESTIONS: [] });
const baseline = [{ id: 'q_attendance', type: 'choice', text: 'Attendance' }];
const meeting = '131d6001-43e4-4426-b07c-9cb7f51e1ab7';
assert.equal(draft.withOctoberMeetingQuestions(baseline, 'tech', meeting).length, 1);
assert.equal(draft.withOctoberMeetingQuestions(baseline, 'default', 'another-meeting').length, 1);
const questions = draft.withOctoberMeetingQuestions(baseline, 'default', meeting);
assert.equal(draft.withOctoberMeetingQuestions(questions, 'default', meeting).length, questions.length);
const merged = checks.buildMergedPreMeeting([{ id: 'og', slug: 'default', name: 'OG HIVE', questions }]);
const ids = merged.sections[0].questions.map(question => question.id);
assert.ok(ids.includes('ball_context') && ids.includes('clothing_interest'), 'explanatory blocks survive the real builder');
const answers = { 'og:ball_choice': 'I’d like to give input.', 'og:ball_timing': 'Saturday', 'og:member_goal': 'A goal' };
const saved = checks.splitMergedAnswers(merged, answers, [])[0].answers;
assert.equal(saved.ball_timing, 'Saturday');
assert.equal(saved.member_goal, 'A goal');
assert.equal(saved.ball_choice, 'I’d like to give input.');
import('../lib/surveyQuestionVisibility.mjs').then(({ getVisibleSurveyQuestions, pruneHiddenSurveyAnswers }) => {
  const input = { ball_choice: 'I’d like to give input.', ball_timing: 'Saturday', ball_audience: 'Members', q_attendance: 'In person' };
  assert.ok(getVisibleSurveyQuestions(merged.sections[0].questions, input).some(question => question.id === 'ball_timing'));
  const skip = pruneHiddenSurveyAnswers(merged.sections[0].questions, { ...input, ball_choice: 'I’m happy for the party-planning committee to choose.' });
  assert.equal(skip.ball_timing, undefined);
  assert.equal(skip.ball_audience, undefined);
  assert.equal(skip.q_attendance, 'In person');
  const next = checks.splitMergedAnswers(merged, Object.fromEntries(Object.entries(skip).map(([key, value]) => [`og:${key}`, value])), [])[0].answers;
  assert.equal(next.q_attendance, 'In person');
  assert.equal(next.ball_timing, undefined);
  let picks = clothing.toggleClothingInterest([], 'Pants');
  picks = clothing.toggleClothingInterest(picks, 'T-shirts');
  picks = clothing.toggleClothingInterest(picks, 'Pants');
  assert.deepEqual(Array.from(picks), ['T-shirts']);
  assert.deepEqual(Array.from(clothing.clothingInterests(['Pants', 'Pants', 'Unknown'])), ['Pants']);
  const selection = clothing.toggleClothingInterest(picks, 'Pants');
  const submitted = checks.splitMergedAnswers(merged, { 'og:q_oct_clothing_interests': selection }, [])[0].answers;
  const syntheticStoredResponse = JSON.parse(JSON.stringify(submitted));
  const responsesByUser = new Map([
    ['member-1', { answers: syntheticStoredResponse }],
    ['member-2', { answers: { q_oct_clothing_interests: ['Pants', 'Pants', 'Unknown'] } }],
    ['outside-hive', { answers: { q_oct_clothing_interests: ['Hoodies'] } }],
  ]);
  const counts = clothing.clothingInterestCountsForMembers([{ id: 'member-1' }, { id: 'member-2' }, { id: 'no-response' }], responsesByUser);
  assert.deepEqual(Array.from(counts, item => [item.option, item.count]), [['Hoodies', 0], ['Pants', 2], ['Shorts', 0], ['T-shirts', 1], ['Socks', 0], ['Fanny packs', 0]]);
  assert.ok(merged.sections[0].questions.find(question => question.id === clothing.CLOTHING_INTEREST_KEY), 'interest selection is part of the real check-in section');
  console.log('PASS: October scope, notes, Ball skip, fixture submission and member-scoped organizer aggregation.');
}).catch(error => { console.error(error); process.exitCode = 1; });

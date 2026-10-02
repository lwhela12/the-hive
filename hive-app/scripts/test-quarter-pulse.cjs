const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Intl,
    require: name => name.endsWith('.png') ? name : load(path.resolve(path.dirname(file), `${name}.ts`)),
  });
  return module.exports;
}

const { openSeasonSections, isSurveyOnHomeToday } = load(path.resolve('lib/checkIns.ts'));
const { endOfMonthContext, isSeptemberNewsletterTomorrowWindow } = load(path.resolve('lib/endOfMonthPeriod.ts'));
const { QUARTER_PULSE_QUESTIONS, OG_QUARTER_PULSE_QUESTIONS, SHARED_QUARTER_PULSE_QUESTION,
  isQuarterPulseOpen, quarterAnswersForMembers, tallyQuarterPulse, quarterPulseTalkingPoints,
  quarterPulseQuestionsForDeck, quarterPulseDeckLines, recentQuarterPulsePeriod } = load(path.resolve('lib/quarterPulse.ts'));
const { monthEndReviewPeriod } = load(path.resolve('supabase/functions/_shared/checkInSession.ts'));
const hives = [
  { id: 'og', slug: 'default', name: 'OG HIVE' },
  { id: 'tech', slug: 'tech', name: 'Tech HIVE' },
  { id: 'show', slug: 'show', name: 'Production HIVE' },
];
for (const day of [27, 30]) {
  const sections = openSeasonSections(hives, new Date(2026, 8, day, 12));
  assert.equal(sections.length, 0, 'quarter choices no longer repeat in an OG section');
}
for (const day of [1, 7]) {
  assert.equal(openSeasonSections(hives, new Date(2026, 9, day, 12)).length, 0);
}
assert.equal(openSeasonSections(hives, new Date(2026, 9, 8, 12)).length, 0);
assert.equal(openSeasonSections(hives, new Date(2026, 11, 29, 12)).length, 3, 'year sections retain their HIVE scopes');
assert.equal(endOfMonthContext(new Date('2026-10-01T06:59:00Z')).period, '2026-09');
assert.equal(endOfMonthContext(new Date('2026-10-01T07:01:00Z')).period, '2026-09');
assert.equal(endOfMonthContext(new Date('2026-10-08T19:00:00Z')).period, '2026-10');
assert.equal(isSeptemberNewsletterTomorrowWindow(new Date('2026-10-01T06:59:00Z')), false, 'September 30 Pacific has no launch reminder');
assert.equal(isSeptemberNewsletterTomorrowWindow(new Date('2026-10-01T07:01:00Z')), true, 'October 1 Pacific has the launch reminder');
assert.equal(isSeptemberNewsletterTomorrowWindow(new Date('2026-10-02T06:59:00Z')), true, 'the reminder remains through October 1 Pacific');
assert.equal(isSeptemberNewsletterTomorrowWindow(new Date('2026-10-02T07:01:00Z')), true, 'October 2 Pacific keeps the relative reminder for a delayed invitation');
assert.equal(isSeptemberNewsletterTomorrowWindow(new Date('2026-10-03T06:59:00Z')), true, 'the reminder remains through October 2 Pacific');
assert.equal(isSeptemberNewsletterTomorrowWindow(new Date('2026-10-03T07:01:00Z')), false, 'October 3 Pacific hides the stale reminder');
for (const day of ['2026-10-01', '2026-10-07']) assert.equal(monthEndReviewPeriod(day), '2026-09');
assert.equal(monthEndReviewPeriod('2026-10-08'), '2026-10');
assert.equal(monthEndReviewPeriod('2027-01-01'), '2026-12');
assert.equal(recentQuarterPulsePeriod(new Date(2026, 9, 15)), '2026-09');
assert.equal(recentQuarterPulsePeriod(new Date(2026, 10, 1)), null);
assert.deepEqual(Array.from(quarterPulseQuestionsForDeck('default'), question => question.id), ['q_quarter_helping', 'q_quarter_help_next']);
assert.deepEqual(Array.from(quarterPulseQuestionsForDeck('tech'), question => question.id), ['q_quarter_helping', 'q_quarter_help_next']);
assert.deepEqual(Array.from(quarterPulseQuestionsForDeck('show'), question => question.id), [], 'Production has no pulse talking points');
assert.equal(isQuarterPulseOpen(new Date(2026, 8, 26, 12)), false);
assert.equal(isQuarterPulseOpen(new Date(2026, 8, 27, 12)), true);
assert.equal(isQuarterPulseOpen(endOfMonthContext(new Date('2026-10-07T19:00:00Z')).reviewDate), true);
assert.equal(isQuarterPulseOpen(endOfMonthContext(new Date('2026-10-08T19:00:00Z')).reviewDate), false);
const sharedAnswers = quarterAnswersForMembers(['og-tech', 'og-tech', 'tech', 'legacy', 'skipped'], SHARED_QUARTER_PULSE_QUESTION,
  [{ user_id: 'og-tech', answers: { q_quarter_help_next: 'A gentle nudge' } },
    { user_id: 'tech', answers: { q_quarter_help_next: 'Time to work together' } }],
  [{ user_id: 'og-tech', answers: { q_quarter_help_next: 'Something else' } },
    { user_id: 'legacy', answers: { q_quarter_help_next: 'Ideas or connections' } }]);
const sharedTally = tallyQuarterPulse(sharedAnswers, SHARED_QUARTER_PULSE_QUESTION);
assert.equal(sharedTally.answered, 3, 'one answer per member, with old OG answer as fallback');
assert.equal(sharedTally.rows.find(row => row.option === 'Something else').count, 0, 'shared answer wins over old OG answer');
assert.equal(sharedTally.rows.find(row => row.option === 'Ideas or connections').count, 1);
const result = tallyQuarterPulse([
  { q_quarter_helping: 'Yes' }, { q_quarter_helping: 'A little' }, { q_quarter_helping: 'Yes' }, {},
], QUARTER_PULSE_QUESTIONS[0]);
assert.equal(result.answered, 3);
assert.equal(result.rows[0].count, 2);
assert.equal(result.rows[0].percent, 67);
assert.equal(result.rows[1].percent, 33);
const scopedCounts = [
  { question_id: 'q_quarter_helping', option: 'Yes', response_count: 3 },
  { question_id: 'q_quarter_helping', option: 'A little', response_count: 1 },
  { question_id: 'q_quarter_help_next', option: 'A gentle nudge', response_count: 2 },
  { question_id: 'q_quarter_help_next', option: 'Time to work together', response_count: 1 },
];
assert.equal(quarterPulseTalkingPoints(scopedCounts, OG_QUARTER_PULSE_QUESTIONS[0])[0].percent, 75);
assert.equal(quarterPulseTalkingPoints(scopedCounts, SHARED_QUARTER_PULSE_QUESTION)[0].answered, 3);
assert.equal(quarterPulseTalkingPoints([], SHARED_QUARTER_PULSE_QUESTION).length, 0, 'zero answers produce no talking point');
assert.deepEqual(Array.from(quarterPulseDeckLines([], 'default'), line => [line.question.id, line.point]),
  [['q_quarter_helping', null], ['q_quarter_help_next', null]], 'OG shows both unanswered questions');
assert.deepEqual(Array.from(quarterPulseDeckLines([], 'tech'), line => line.question.id),
  ['q_quarter_helping', 'q_quarter_help_next'], 'Tech shows both choices for its own member roster');
assert.equal(quarterPulseDeckLines([], 'show').length, 0, 'Production remains outside the pulse summary');
const mixedLines = quarterPulseDeckLines([{ question_id: 'q_quarter_helping', option: 'Yes', response_count: 1 }], 'default');
assert.equal(mixedLines[0].point.percent, 100);
assert.equal(mixedLines[1].point, null, 'one answered question does not hide the other empty question');
assert.deepEqual(Array.from(quarterPulseTalkingPoints([
  { question_id: 'q_quarter_helping', option: 'Yes', response_count: 1 },
  { question_id: 'q_quarter_helping', option: 'A little', response_count: 1 },
], OG_QUARTER_PULSE_QUESTIONS[0]), row => row.percent), [50, 50], 'ties show both choices with the same denominator');
assert.equal(quarterPulseTalkingPoints(scopedCounts, { ...SHARED_QUARTER_PULSE_QUESTION, id: 'private_production_question' }).length, 0,
  'an unreturned question cannot become a talking point');
assert.equal(isSurveyOnHomeToday({ title: 'Quarterly Check-in · Q3 2026', due_date: '2026-10-01T00:00:00Z' }, new Date(2026, 8, 30)), false);
console.log('Quarter pulse: two shared choices, separate OG and Tech decks, Pacific month grace, legacy fallback, and tally passed.');

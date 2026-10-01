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
const { endOfMonthContext } = load(path.resolve('lib/endOfMonthPeriod.ts'));
const { QUARTER_PULSE_QUESTIONS, tallyQuarterPulse, recentQuarterPulsePeriod } = load(path.resolve('lib/quarterPulse.ts'));
const { monthEndReviewPeriod } = load(path.resolve('supabase/functions/_shared/checkInSession.ts'));
const hives = [
  { id: 'og', slug: 'default', name: 'OG HIVE' },
  { id: 'tech', slug: 'tech', name: 'Tech HIVE' },
  { id: 'show', slug: 'show', name: 'Production HIVE' },
];
for (const day of [27, 30]) {
  const sections = openSeasonSections(hives, new Date(2026, 8, day, 12));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].communityId, 'og');
  assert.equal(sections[0].name, 'OG HIVE · Q3 2026');
  assert.deepEqual(Array.from(sections[0].questions, question => question.text), Array.from(QUARTER_PULSE_QUESTIONS, question => question.text));
}
for (const day of [1, 7]) {
  assert.equal(openSeasonSections(hives, new Date(2026, 9, day, 12))[0]?.name, 'OG HIVE · Q3 2026');
}
assert.equal(openSeasonSections(hives, new Date(2026, 9, 8, 12)).length, 0);
assert.equal(endOfMonthContext(new Date('2026-10-01T06:59:00Z')).period, '2026-09');
assert.equal(endOfMonthContext(new Date('2026-10-01T07:01:00Z')).period, '2026-09');
assert.equal(endOfMonthContext(new Date('2026-10-08T19:00:00Z')).period, '2026-10');
for (const day of ['2026-10-01', '2026-10-07']) assert.equal(monthEndReviewPeriod(day), '2026-09');
assert.equal(monthEndReviewPeriod('2026-10-08'), '2026-10');
assert.equal(monthEndReviewPeriod('2027-01-01'), '2026-12');
assert.equal(recentQuarterPulsePeriod(new Date(2026, 9, 15)), '2026-09');
assert.equal(recentQuarterPulsePeriod(new Date(2026, 10, 1)), null);
const result = tallyQuarterPulse([
  { q_quarter_helping: 'Yes' }, { q_quarter_helping: 'A little' }, { q_quarter_helping: 'Yes' }, {},
], QUARTER_PULSE_QUESTIONS[0]);
assert.equal(result.answered, 3);
assert.equal(result.rows[0].count, 2);
assert.equal(result.rows[0].percent, 67);
assert.equal(result.rows[1].percent, 33);
assert.equal(isSurveyOnHomeToday({ title: 'Quarterly Check-in · Q3 2026', due_date: '2026-10-01T00:00:00Z' }, new Date(2026, 8, 30)), false);
console.log('Quarter pulse: OG-only choices, Pacific month grace, legacy card suppression, and tally passed.');

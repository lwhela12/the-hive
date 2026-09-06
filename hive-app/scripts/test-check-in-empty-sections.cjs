const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date,
    require: name => name.endsWith('.png') ? name : load(path.resolve(path.dirname(file), `${name}.ts`)),
  });
  return module.exports;
}

const { buildMergedEndOfMonth, mergedPreMeetingQuestions, splitMergedAnswers } = load(path.resolve('lib/checkIns.ts'));
const hives = [
  { id: 'og', slug: 'default', name: 'OG HIVE' },
  { id: 'tech', slug: 'tech', name: 'Tech HIVE' },
  { id: 'pro', slug: 'production', name: 'Production HIVE' },
];
const personal = [{ id: 'month', type: 'long', text: 'Your month' }];
const ordinary = buildMergedEndOfMonth(personal, hives, new Date(2026, 8, 6));
// The screen keeps a section for each HIVE so commitments can be saved even
// when no seasonal questions are open.
ordinary.sections.push(...hives.map(h => ({ communityId: h.id, slug: h.slug, name: h.name, questions: [] })));
const original = JSON.stringify(ordinary);
assert.equal(mergedPreMeetingQuestions({ ...ordinary, personal: [] }).length, 0,
  'commitments-only forms end after the roster, without an empty introduction');
assert.equal(mergedPreMeetingQuestions(ordinary).map(e => e.key).join(','), 'month',
  'personal month questions remain available');
assert.equal(splitMergedAnswers(ordinary, {}, []).map(r => r.communityId).join(','), 'og,tech,pro',
  'all HIVE completion receipts remain saveable');
assert.equal(JSON.stringify(ordinary), original, 'rendering does not remove storage sections');

const seasonal = buildMergedEndOfMonth(personal, hives, new Date(2026, 8, 29));
assert.ok(seasonal.sections.length > 0, 'quarter preview includes real questions');
for (const section of seasonal.sections) {
  const fields = mergedPreMeetingQuestions({ ...seasonal, personal: [], sections: [section] });
  assert.equal(fields.length, section.questions.length + 1, 'real sections retain their introduction');
  assert.equal(fields[0].question.type, 'note');
  assert.equal(fields[1].key, `${section.communityId}:${section.questions[0].id}`,
    'seasonal answer routing remains scoped to the HIVE');
}
console.log('Empty check-in introductions hidden; commitments and seasonal questions preserved.');

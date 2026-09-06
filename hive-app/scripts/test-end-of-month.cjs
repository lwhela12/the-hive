const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, require: name => load(path.resolve(path.dirname(file), `${name}.ts`)) });
  return module.exports;
}
const { restoreEndOfMonthAnswers, endOfMonthTaskResponses, saveEndOfMonth } = load(path.resolve('lib/endOfMonth.ts'));
const task = { id: 'task', type: 'action_item', label: 'Bring props', sourceLabel: 'To-do' };
const answers = restoreEndOfMonthAnswers(['og', 'tech', 'production'], {
  og: { quarterly: 'keep this', q_newsletter: 'legacy' }, month: { q_eom_newsletter: 'My event', q_shoutout: 'Thank you' },
}, { og: { quarterly: 'new draft' }, month: { q_newsletter: 'My event' } });
assert.equal(answers.hives.og.quarterly, 'new draft');
assert.equal(answers.month.q_newsletter, 'My event');
assert.equal(answers.month.q_eom_newsletter, undefined);
assert.equal(answers.month.q_shoutout, 'Thank you');
answers.hives.production.q_carry_forward_items = [{ ...task, status: 'done' }, { ...task, id: 'stale', status: 'archive' }];
const tasks = endOfMonthTaskResponses([task, { ...task, id: 'wish', type: 'wish' }], answers.hives.production);
assert.equal(tasks.length, 1);
assert.equal(tasks[0].status, 'done');
async function run() {
  const calls = [];
  const options = { answers, communityIds: ['og', 'tech', 'production'], todos: { production: [task] },
    applyTasks: async items => { calls.push(['tasks', items]); return { error: null }; },
    save: async (id, value) => { calls.push([id, value]); return { error: null }; } };
  assert.equal((await saveEndOfMonth(options)).error, null);
  assert.equal(calls.map(call => call[0]).join(','), 'tasks,og,tech,production,');
  assert.equal(calls[0][1].length, 1);
  assert.equal(calls[1][1].quarterly, 'new draft');
  assert.equal(calls[1][1].q_newsletter, undefined);
  assert.equal(calls.at(-1)[1].q_newsletter, 'My event');
  calls.length = 0;
  assert.ok((await saveEndOfMonth({ ...options, applyTasks: async () => ({ error: 'offline' }) })).error);
  assert.equal(calls.length, 0, 'task failure must not write completion receipts');
  const failedCalls = [];
  assert.ok((await saveEndOfMonth({ ...options, save: async id => {
    failedCalls.push(id); return { error: id === 'tech' ? 'offline' : null };
  } })).error);
  assert.equal(failedCalls.join(','), 'og,tech', 'never claim shared completion after partial failure');
  assert.ok((await saveEndOfMonth({ ...options, save: async id => ({ error: id === null ? 'offline' : null }) })).error);
  assert.ok((await saveEndOfMonth({ ...options, save: async () => { throw new Error('network'); } })).error);
  assert.equal((await saveEndOfMonth(options)).error, null, 'the same draft remains retryable');
  assert.equal(answers.hives.og.q_newsletter, 'legacy', 'save does not mutate the draft');
  console.log('One-page check-in: scoped tasks, draft migration, shared Buzz save, and failure/retry paths passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

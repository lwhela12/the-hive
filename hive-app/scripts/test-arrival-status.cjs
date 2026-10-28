const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => imports[name] ?? {}, Date, Map, Set });
  return module.exports;
}
const selection = load('lib/arrivalSurveySelection.ts');
const { getArrivalStatus, getArrivalGroups } = load('lib/hooks/useArrivalBoard.ts', { '../arrivalSurveySelection': selection });
const reply = (attendance, time = '2026-10-28T16:00:00Z') => ({ answers: attendance ? { q_attendance: attendance } : {}, submitted_at: time });
const report = (attendance, time = '2026-10-28T17:00:00Z') => ({ attendance, updated_at: time });
assert.equal(getArrivalStatus(), 'not_checked_in');
assert.equal(getArrivalStatus(reply()), 'unconfirmed', 'a submitted form without attendance is not assumed present');
assert.equal(getArrivalStatus(undefined, report(null)), 'unconfirmed', 'an admin wish alone is not an attendance decision');
assert.equal(getArrivalStatus(reply('In person')), 'in_person');
assert.equal(getArrivalStatus(reply('Joining remotely')), 'remote');
assert.equal(getArrivalStatus(reply('Missing this one')), 'missing');
assert.equal(getArrivalStatus(reply('Joining remotely'), report('missing')), 'missing', 'newer admin update overrides remote');
assert.equal(getArrivalStatus(reply('In person', '2026-10-28T18:00:00Z'), report('missing')), 'in_person', 'member can update attendance afterward');
const members = ['pending', 'absent', 'remote', 'present2', 'present1', 'unknown'].map(id => ({ id, name: id, avatar_url: null }));
const responses = new Map([
  ['absent', reply('Joining remotely')], ['remote', reply('Joining remotely')],
  ['present2', reply('In person', '2026-10-28T16:05:00Z')], ['present1', reply('In person')], ['unknown', reply()],
]);
const groups = getArrivalGroups(members, responses, new Map([['absent', report('missing')]]));
assert.deepEqual(Array.from(groups, group => [group.status, Array.from(group.members, member => member.id)]), [
  ['in_person', ['present1', 'present2']], ['remote', ['remote']], ['missing', ['absent']], ['unconfirmed', ['unknown']], ['not_checked_in', ['pending']],
]);
const ids = Array.from(groups).flatMap(group => Array.from(group.members, member => member.id));
assert.equal(new Set(ids).size, members.length, 'every member appears once');
assert.equal(ids.length, members.length, 'counts cover the whole roster');
console.log('PASS: attendance groups, missing/unknown distinction, report precedence, newer member replies, and order within groups.');

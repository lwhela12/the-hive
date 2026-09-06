const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, require: name => name.endsWith('.png') ? name : load(path.resolve(path.dirname(file), `${name}.ts`)) });
  return module.exports;
}
const { getMentionSuggestions, getGroupMentionSuggestions, insertMention, getMentionedGroups } = load(path.resolve('lib/mentions.ts'));
const hives = [{ id: 'og', name: 'OG HIVE' }, { id: 'tech', name: 'Tech HIVE' }, { id: 'production', name: 'Production HIVE' }];
const reach = { reach: 'all_hives', otherHives: hives, offerOtherHives: true };
assert.equal(getGroupMentionSuggestions('', reach).length, 4, 'one wide option plus all three HIVEs');
assert.equal(getGroupMentionSuggestions('tech', reach)[0].communityId, 'tech');
assert.equal(getGroupMentionSuggestions('', { reach: 'all_hives', hive: hives[0], otherHives: hives.slice(1) }).length, 2, 'ordinary composers retain their scoped picker');
assert.equal(getGroupMentionSuggestions('', { ...reach, reach: 'hive' }).filter(row => !row.disabled).length, 0, 'an opt-in cannot bypass a narrow reach');
const people = [{ id: 'nic', name: 'Nic Munson' }];
const nic = getMentionSuggestions('nic', people, undefined, 10, reach)[0];
assert.equal(nic.id, 'nic');
const inserted = insertMention('Thanks @nic for helping', 11, nic);
assert.equal(inserted.text, 'Thanks @Nic  for helping');
assert.equal(insertMention('', 0, getGroupMentionSuggestions('tech', reach)[0]).text, '@tech ');
assert.equal(getMentionedGroups('@tech', reach)[0].id, 'tech');
const { buzzCalendarItems } = load(path.resolve('lib/buzzCalendar.ts'));
const calendar = buzzCalendarItems([
  { id: 'event', title: 'Taste', event_date: '2026-09-23', event_type: 'social', event_time: '19:00' },
  { id: 'event', title: 'Taste', event_date: '2026-09-23', event_type: 'social', event_time: '19:00' },
  { id: 'away', title: 'Out of town', event_date: '2026-09-14', event_type: 'social' },
  { id: 'next', title: 'October', event_date: '2026-10-01', event_type: 'social' },
], [{ id: 'person', name: 'Member', birthday: '1980-09-10' }, { id: 'person', name: 'Member', birthday: '1980-09-10' }], '2026-09');
assert.equal(calendar.length, 2);
assert.equal(calendar[0].event_date, '2026-09-10');
assert.equal(JSON.stringify(calendar).includes('1980'), false, 'birthday display omits birth year');
console.log('Buzz: person/group mentions, scoped picker defaults, insertion, calendar deduplication and birthday display passed.');

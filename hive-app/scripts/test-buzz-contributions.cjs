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
const { getMentionSuggestions, getGroupMentionSuggestions, insertMention, getMentionedGroups,
  isMentionTargetSelected, toggleMentionTarget } = load(path.resolve('lib/mentions.ts'));
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
const wide = getGroupMentionSuggestions('', reach).find(row => row.group === 'hive_wide');
const og = getGroupMentionSuggestions('', reach).find(row => row.communityId === 'og');
const tech = getGroupMentionSuggestions('', reach).find(row => row.communityId === 'tech');
const safeReach = { ...reach, otherHives: hives.slice(0, 2) };
let draft = 'Thanks for showing up';
draft = toggleMentionTarget(draft, draft.length, wide, safeReach).text;
draft = toggleMentionTarget(draft, draft.length, og, safeReach).text;
assert.equal(isMentionTargetSelected(draft, wide, safeReach), true);
assert.equal(isMentionTargetSelected(draft, og, safeReach), true);
draft = toggleMentionTarget(draft, draft.length, wide, safeReach).text;
assert.equal(isMentionTargetSelected(draft, wide, safeReach), false);
assert.equal(isMentionTargetSelected(draft, og, safeReach), true, 'removing wide keeps OG and prose');
assert.match(draft, /^Thanks for showing up @og/);
assert.equal(toggleMentionTarget('Thanks @og and @tech for @Nic.', 29, og, safeReach).text,
  'Thanks and @tech for @Nic.', 'a typed tag toggles off without erasing other mentions');
assert.equal(toggleMentionTarget('Thanks @og. See you there.', 26, og, safeReach).text,
  'Thanks. See you there.', 'sentence punctuation belongs to the authored prose');
assert.equal(toggleMentionTarget('@og @og keep this', 17, og, safeReach).text, 'keep this', 'repeated tags all clear');
assert.equal(toggleMentionTarget('Hi @all @everyone @tech', 23, wide, safeReach).text, 'Hi @tech',
  'all HIVE-Wide aliases clear while a different HIVE tag remains');
assert.equal(isMentionTargetSelected('Thanks @Nic for helping', nic, safeReach), true);
assert.equal(toggleMentionTarget('Thanks @Nic for helping @tech', 29, nic, safeReach).text,
  'Thanks for helping @tech', 'person bubbles also toggle without removing group tags');
assert.equal(isMentionTargetSelected('Thanks @te', tech, safeReach), false, 'typing a partial handle does not select the chip');
assert.equal(toggleMentionTarget('Thanks @te', 10, tech, safeReach).text, 'Thanks @tech ', 'typing @ and picking completes the handle');
const reloaded = JSON.parse(JSON.stringify({ text: draft })).text;
assert.equal(isMentionTargetSelected(reloaded, og, safeReach), true, 'chip selection derives from saved text on reload');
assert.equal(isMentionTargetSelected(reloaded.replace('@og', ''), og, safeReach), false, 'deleting a typed @ tag updates selection');
assert.equal(getMentionedGroups('@production @og', safeReach).some(group => group.kind === 'hive' && group.id === 'production'), false,
  'a sealed HIVE is not a Buzz tag target');
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

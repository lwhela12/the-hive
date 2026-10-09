const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const source = ts.transpileModule(fs.readFileSync('lib/networkingEvent.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const networking = {};
vm.runInNewContext(source, { exports: networking, URL });

assert.equal(networking.normalizeEventInfoUrl('startup.vegas/events/levelup'), 'https://startup.vegas/events/levelup');
assert.equal(networking.normalizeEventInfoUrl('https://startup.vegas/events/levelup'), 'https://startup.vegas/events/levelup');
assert.equal(networking.normalizeEventInfoUrl('not a link'), null);
assert.equal(networking.normalizeEventInfoUrl(''), '');

const description = networking.networkingEventDescription({
  focus: 'Startup founders', cost: 'Free', infoUrl: 'https://startup.vegas/events/levelup',
});
assert.equal(description, 'Focus: Startup founders\nCost: Free\nInfo: https://startup.vegas/events/levelup');
assert.deepEqual(JSON.parse(JSON.stringify(networking.readNetworkingEventDetails(description))), {
  focus: 'Startup founders', cost: 'Free', infoUrl: 'https://startup.vegas/events/levelup',
});
assert.equal(networking.networkingDescriptionWithoutLink(description), 'Focus: Startup founders\nCost: Free');
assert.equal(networking.readNetworkingEventDetails('A normal event description'), null);

const deck = fs.readFileSync('app/(app)/meeting-helper.tsx', 'utf8');
assert.match(deck, /deckSlug === 'tech' \? \(\s*<BounceScrollView[\s\S]*?Add networking event/);
assert.match(deck, /Pencil it in/, 'OG keeps its original hang form');
assert.match(deck, /newEvent\.description = description/);
assert.match(deck, /newEvent\.location = quickAddLocation\.trim\(\)/);

const home = fs.readFileSync('app/(app)/hive.tsx', 'utf8');
assert.match(home, /readNetworkingEventDetails\(event\.description\)/);
assert.match(home, /Event info ↗/);

console.log('PASS: Tech networking event fields persist, the info link opens from Home, and OG keeps its hang form.');

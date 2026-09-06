const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Read executable declarations through the TypeScript AST, so comments cannot
// satisfy the guard and the tests exercise the same deck and JSX as the app.
const source = fs.readFileSync('app/(app)/meeting-helper.tsx', 'utf8');
const ast = ts.createSourceFile('meeting-helper.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing executable ${name}`);
  return `const ${name} = ${found};`;
}
const shared = fs.readFileSync('lib/hiveWide.ts', 'utf8');
const sharedModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(shared, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: sharedModule.exports, module: sharedModule });
const context = {
  React, SCOPE_LADDER: sharedModule.exports.SCOPE_LADDER,
  View: ({ children }) => React.createElement('div', null, children),
  Text: ({ children }) => React.createElement('p', null, children),
  SlideTitle: ({ children }) => React.createElement('h1', null, children),
  sz: (_tv, small) => small, CHARCOAL: '#313130', GOLD: '#2f82c2', GOLD_DEEP: '#011f46',
};
const extracted = ['DECKS', 'HIVE_INTRO', 'APP_TOUR', 'renderWhatIsHive'].map(declaration).join('\n');
vm.runInNewContext(ts.transpileModule(`${extracted}\nthis.result = { DECKS, HIVE_INTRO, APP_TOUR, renderWhatIsHive };`,
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText, context);
const { DECKS, HIVE_INTRO, APP_TOUR, renderWhatIsHive } = context.result;
assert.deepEqual(Array.from(DECKS.tech.slides), ['room', 'outline', 'whatis', 'news', 'treasurer', 'meetups', 'hummdinger', 'wrapup', 'thanks']);
assert.deepEqual(Array.from(DECKS.default.slides), ['room', 'outline', 'rollcall', 'news', 'treasurer', 'meetups', 'hummdinger', 'wrapup', 'thanks']);
assert.deepEqual(Array.from(DECKS.show.slides), ['room', 'outline', 'rollcall', 'news', 'meetups', 'assignments', 'wrapup', 'thanks']);
for (const deck of Object.values(DECKS)) {
  assert.deepEqual(Array.from(deck.agenda, item => item.key), Array.from(deck.slides).filter(key => key !== 'thanks'), 'Outline and navigation agree with actual slide order');
  assert.equal(new Set(deck.slides).size, deck.slides.length, 'Every shared presentation key is unique');
}
assert.equal(DECKS.tech.agenda.find(item => item.key === 'whatis').label, HIVE_INTRO.title);
assert.match(declaration('SLIDE_RENDERERS'), /whatis:\s*renderWhatIsHive/, 'The shared renderer resolves the new presentation key');
assert.deepEqual(Array.from(APP_TOUR, item => item.what), ['Wishes', 'Boards', 'Messages', 'Members', 'Clive', 'Check-ins'], 'The existing app tour stays intact');
assert.equal(HIVE_INTRO.points.find(item => item.heading === 'HIVE-Wide').body, sharedModule.exports.SCOPE_LADDER.find(item => item.key === 'all_hives').meaning);
const html = renderToStaticMarkup(renderWhatIsHive());
assert.match(html, /<h1>What is HIVE\?<\/h1>/);
for (const point of HIVE_INTRO.points) assert.ok(html.includes(point.heading) && html.includes(point.body), 'Every explanation renders in full');
assert.ok(!/<(button|input|textarea|a)\b/.test(html), 'The introduction has no writes or detours');
assert.ok([HIVE_INTRO.lead, ...HIVE_INTRO.points.map(point => point.body)].join(' ').split(/\s+/).length < 75, 'Keep the presentation copy glanceable');
console.log('PASS: Tech introduction, all three slide orders, agenda parity, shared presentation key, full rendered copy, unchanged app tour and shared HIVE-Wide meaning.');

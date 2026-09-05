// Render the real panel/RN Web switch offline. No auth, DB, or email access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const source = fs.readFileSync('components/admin/EmailTemplatesPanel.tsx', 'utf8');
const templates = ['message', 'mention', 'boardReply', 'checkIn', 'monthCheckIn'].map((key, i) => ({ key, name: key, approved: i < 3, revision: 'fixture', subject: key, html: '<p>Fixture</p>' }));
const states = [null, [], null, null, templates, 'ready', null, 'idle'];
let stateIndex = 0;
const exportsObject = {};
const imported = id => {
  if (id === 'react') return { ...React, useState: () => [states[stateIndex++], () => {}], useEffect: () => {} };
  if (id === 'react-native') return RN;
  if (id.includes('supabase')) return { supabase: new Proxy({}, { get() { throw new Error('Network forbidden'); } }) };
  if (id.includes('hiveBrand')) return { HIVE_GOLD: '#bd9348' };
  return require(id);
};
new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(imported, exportsObject);
const html = renderToStaticMarkup(React.createElement(exportsObject.EmailTemplatesPanel, { Panel: ({ children }) => React.createElement(RN.View, null, children) }));
assert.match(html, /Email 2 previews/);
assert.match(html, /Unapproved only · Just to you/);
assert.doesNotMatch(html, /Approve template wording once|Test copies only, to you|Already approved templates are skipped/);
assert.equal((html.match(/role="switch"/g) || []).length, 5);
assert.equal((html.match(/checked=""/g) || []).length, 3);
assert.equal((html.match(/background-color:rgba\(246,244,229,1.00\)/g) || []).length, 5, 'every actual RN Web thumb must be cream, including ON');
assert.doesNotMatch(html, /0,150,136/);
if (process.env.HIVE_PREVIEW_FIXTURE) {
  const css = RN.StyleSheet.getSheet().textContent;
  fs.writeFileSync(process.env.HIVE_PREVIEW_FIXTURE, `<!doctype html><html><head><style>${css}</style></head><body style="background:#0b0b12;padding:24px;max-width:600px">${html}</body></html>`);
}
console.log('PASS: actual panel + RN Web rendered; dynamic two-pending preview copy, 3 on/2 off, all 5 cream thumbs. No network.');

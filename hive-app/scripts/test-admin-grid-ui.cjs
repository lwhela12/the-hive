// Actual existing Admin grid rendered through React Native Web, offline fixtures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const compile = (source, imports) => {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(imports, exports);
  return exports;
};
const time = compile(fs.readFileSync('lib/timeInput.ts', 'utf8'), require);
const grid = { state: 'ready', peopleAcrossAllHives: 0, hives: ['17:00', '18:00'].map((time, i) => ({ communityId: String(i), name: `Fixture ${i}`, members: 0, nextMeeting: { date: '2026-09-08', time, location: null, onMeet: false }, beforeWeMeet: null, endOfMonth: null, endOfMonthCounted: false, ceiling: 'hive', honeyPot: false })) };
const source = fs.readFileSync('components/admin/WhatsNextPanel.tsx', 'utf8');
const imports = id => {
  if (id === 'react') return { ...React, useState: () => ['grid', () => {}] };
  if (id === 'react-native') return RN;
  if (id === 'expo-router') return { useRouter: () => ({}) };
  if (id === '@expo/vector-icons') return {};
  if (id.includes('useWhatsNext')) return { useWhatsNext: () => ({ items: [], state: 'ready', today: '2026-09-05' }) };
  if (id.includes('WhatsNextList')) return { WhatsNextList: () => null };
  if (id.includes('useAuth')) return { useAuth: () => ({ memberships: [] }) };
  if (id.includes('hiveBrand')) return { hiveDisplayName: name => name };
  if (id.includes('useHiveGrid')) return { useHiveGrid: () => grid };
  if (id.includes('hiveRules')) return { HIVE_RULES: [] };
  if (id.includes('timeInput')) return time;
  return require(id);
};
const panel = compile(source, imports);
const html = renderToStaticMarkup(React.createElement(panel.WhatsNextPanel, { Panel: ({ children }) => React.createElement(RN.View, null, children) }));
assert.match(html, /5:00 PM/);
assert.match(html, /6:00 PM/);
assert.doesNotMatch(html, /17:00|18:00/);
assert.match(html, /Next meeting/);
console.log('PASS: existing Admin grid renders actual RN Web with 5:00 PM / 6:00 PM, not raw 24-hour times. Offline fixtures, no live-count claim.');

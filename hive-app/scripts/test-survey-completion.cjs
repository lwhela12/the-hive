const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');

// Exercise the real form's save/exit handlers without writing member data.
function harness(result) {
  const slots = []; let cursor = 0; let saves = 0; let exits = 0; let removed = 0;
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
  };
  const mocks = {
    react, 'react/jsx-runtime': jsx,
    'react-native': Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(n => [n, n])),
    'expo-image': { Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      setItem: async () => {}, multiRemove: async () => { removed++; },
    } },
    '../../lib/pageSkin': { SPACE_SKIN: {} },
    '../../lib/hiveBrand': { hiveSeal: () => 1, hiveAccent: () => '#bb9445', accentPalette: () => ({}) },
    '../../lib/carryForward': {}, '../../lib/endOfMonth': {}, '../../lib/actionItemDisplay': {},
    './SurveyQuestionField': { SurveyQuestionField: 'Question' },
    './BuzzContributionInput': { BuzzContributionInput: 'Input' },
    './BuzzCalendarPreview': { BuzzCalendarPreview: 'Calendar' },
  };
  function load(file) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { module, exports: module.exports, require: name => {
      if (name.endsWith('.png')) return 1;
      assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name];
    } });
    return module.exports;
  }
  const { SurveyCompletion } = load('components/surveys/SurveyCompletion.tsx');
  mocks['./SurveyCompletion'] = { SurveyCompletion };
  const { EndOfMonthForm } = load('components/surveys/EndOfMonthForm.tsx');
  const props = { sections: [], initialAnswers: { hives: {}, month: { q_shoutout: 'Keep my words' } },
    draftKey: 'test', legacyDraftKeys: [], readOnly: false, doneLabel: 'Back to Home',
    onSave: async answers => { saves++; assert.equal(answers.month.q_shoutout, 'Keep my words'); return await result(); },
    onDone: () => { exits++; }, onEmailSettings: () => {},
  };
  function render() { cursor = 0; return EndOfMonthForm(props); }
  return { render, SurveyCompletion, counts: () => ({ saves, exits, removed }) };
}
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
function text(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node?.props ? text(node.props.children) : '';
}
function button(tree, label) { return walk(tree).find(n => n.type === 'Pressable' && text(n).trim() === label); }
(async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  let tree = h.render();
  const saving = button(tree, 'Save check-in').props.onPress();
  await Promise.resolve();
  tree = h.render();
  assert.equal(button(tree, 'Done for now').props.disabled, true, 'cannot exit mid-save');
  assert.ok(!walk(tree).some(n => n.type === h.SurveyCompletion), 'no success before save resolves');
  finish({ error: null }); await saving;
  tree = h.render();
  assert.ok(!walk(tree).some(n => n.type === 'Input'), 'saved form is replaced');
  const success = walk(tree).find(n => n.type === h.SurveyCompletion);
  assert.ok(success);
  const completion = h.SurveyCompletion(success.props);
  button(completion, 'Back to Home').props.onPress();
  assert.deepEqual(h.counts(), { saves: 1, exits: 1, removed: 1 });
  button(completion, 'Review answers').props.onPress();
  assert.ok(walk(h.render()).some(n => n.type === 'Input' && n.props.value === 'Keep my words'), 'review retains answers');
  for (const result of [async () => ({ error: 'One HIVE could not save' }), async () => { throw Error('offline'); }]) {
    const bad = harness(result);
    await button(bad.render(), 'Save check-in').props.onPress();
    const failed = bad.render();
    assert.ok(walk(failed).some(n => n.props?.accessibilityRole === 'alert'));
    assert.ok(!walk(failed).some(n => n.type === bad.SurveyCompletion));
    assert.ok(button(failed, 'Save check-in'), 'retry remains available');
    assert.deepEqual(bad.counts(), { saves: 1, exits: 0, removed: 0 }, 'failure retains draft and does not exit');
  }
  console.log('Survey completion: success replaces form, explicit exit, review preserves answers, pending/error saves remain safe.');
})().catch(error => { console.error(error); process.exitCode = 1; });

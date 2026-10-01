const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');

// Exercise the real form's save/exit handlers without writing member data.
function harness(result, withTask = false, announcementHives = [], draftFailure = false, showDeadline = false) {
  const slots = []; let cursor = 0; let saves = 0; let exits = 0; let removed = 0; let miqOpens = 0; let savedAnswers;
  const drafts = [];
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
      setItem: async (key, value) => { if (draftFailure) throw new Error('device storage unavailable'); drafts.push([key, JSON.parse(value)]); },
      multiRemove: async () => { removed++; },
    } },
    '../../lib/pageSkin': { SPACE_SKIN: {} },
    '../../lib/hiveBrand': { hiveSeal: () => 1, hiveAccent: () => '#bb9445', hiveDisplayName: name => name,
      accentPalette: () => ({ accent: '#bb9445', ink: '#815e25', line: () => '#ded3ba' }) },
    '../../lib/carryForward': { CARRY_FORWARD_ANSWER_KEY: 'q_carry_forward_items' },
    '../../lib/endOfMonth': { endOfMonthTaskResponses: (items, answers) => items.map(item => ({ ...item,
      status: answers.q_carry_forward_items?.find(saved => saved.id === item.id)?.status ?? 'keep_active' })) },
    '../../lib/actionItemDisplay': { parseActionItemDescription: label => ({ text: label, context: null }) },
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
  const task = { id: 'task', type: 'action_item', sourceLabel: 'To-do', label: 'Complete the full event brief and share accessibility notes', detail: 'Assigned to Nat · Due Oct 5' };
  const announcementSections = announcementHives.map(slug => ({
    community: { id: slug, slug, name: slug === 'default' ? 'OG HIVE' : 'Tech HIVE' }, todos: [], questions: [],
  }));
  const props = { sections: announcementSections.length ? announcementSections
    : withTask ? [{ community: { id: 'og', slug: 'default', name: 'OG HIVE' }, todos: [task], questions: [] }] : [],
    initialAnswers: { hives: withTask ? { og: {} } : {}, month: { q_shoutout: 'Keep my words' } },
    draftKey: withTask ? 'survey-draft:member:survey:2026-09:continuous' : 'test', legacyDraftKeys: [], readOnly: false, doneLabel: 'Back to Home',
    showQuarterAnnouncements: announcementSections.length > 0,
    showNewsletterDeadline: showDeadline,
    sharedQuarterQuestion: announcementSections.length ? { id: 'q_quarter_help_next', text: 'What would help?', type: 'choice', options: ['A gentle nudge'] } : null,
    onOpen3Miq: () => { miqOpens++; },
    onSave: async answers => { saves++; savedAnswers = answers; assert.equal(answers.month.q_shoutout, 'Keep my words'); return await result(); },
    onDone: () => { exits++; }, onEmailSettings: () => {},
  };
  function render() { cursor = 0; return EndOfMonthForm(props); }
  return { render, SurveyCompletion, counts: () => ({ saves, exits, removed }), drafts, savedAnswers: () => savedAnswers,
    miqOpens: () => miqOpens };
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
  await new Promise(resolve => setImmediate(resolve));
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
  const taskForm = harness(async () => ({ error: null }), true);
  let taskTree = taskForm.render();
  const checkbox = walk(taskTree).find(n => n.props?.accessibilityRole === 'checkbox');
  const archive = walk(taskTree).find(n => n.props?.accessibilityLabel?.startsWith('Archive:'));
  assert.ok(walk(taskTree).some(n => n.type === 'View' && Array.isArray(n.props?.children)
    && n.props.children[0] === checkbox && n.props.children[1] === archive), 'Archive sits beside the full task');
  assert.match(text(checkbox), /full event brief.*accessibility notes/);
  assert.match(text(checkbox), /Assigned to Nat · Due Oct 5/);
  const taskLabel = walk(checkbox).find(n => n.type === 'Text' && n.props?.children === 'Complete the full event brief and share accessibility notes');
  assert.equal(taskLabel?.props.numberOfLines, undefined, 'task text is not truncated');
  archive.props.onPress();
  taskTree = taskForm.render();
  const undo = walk(taskTree).find(n => n.props?.accessibilityLabel?.startsWith('Undo archive:'));
  assert.ok(undo, 'Archive can be undone before saving');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(taskForm.drafts.at(-1)[0], 'survey-draft:member:survey:2026-09:continuous', 'draft stays scoped to member, survey and month');
  undo.props.onPress();
  taskTree = taskForm.render();
  assert.ok(walk(taskTree).some(n => n.props?.accessibilityLabel?.startsWith('Archive:')));
  await button(taskTree, 'Save check-in').props.onPress();
  assert.equal(taskForm.savedAnswers().hives.og.q_carry_forward_items[0].status, 'keep_active');
  assert.equal(taskForm.counts().removed, 1, 'successful save clears the scoped draft');
  const archivedForm = harness(async () => ({ error: null }), true);
  walk(archivedForm.render()).find(n => n.props?.accessibilityLabel?.startsWith('Archive:')).props.onPress();
  await button(archivedForm.render(), 'Save check-in').props.onPress();
  assert.equal(archivedForm.savedAnswers().hives.og.q_carry_forward_items[0].status, 'archive');
  const ogWithTech = harness(async () => ({ error: null }), false, ['default', 'tech']);
  const ogAnnouncementTree = ogWithTech.render();
  const ogAnnouncement = text(ogAnnouncementTree);
  assert.match(ogAnnouncement, /It’s hoodie season!/);
  assert.match(ogAnnouncement, /Honey Pot dues.*Bumblebee Ball.*reach out to Nat.*virtually or in person/);
  assert.doesNotMatch(ogAnnouncement, /Not in OG\?/);
  const sharedQuestion = walk(ogAnnouncementTree).filter(node => node.type === 'Question' && node.props.question.id === 'q_quarter_help_next');
  assert.equal(sharedQuestion.length, 1, 'a member in OG and Tech answers the support choice once');
  sharedQuestion[0].props.onChange('A gentle nudge');
  button(ogWithTech.render(), 'Explore my 3MIQ').props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ogWithTech.miqOpens(), 1);
  assert.equal(ogWithTech.drafts.at(-1)[1].month.q_quarter_help_next, 'A gentle nudge', 'the shared choice drafts before leaving for Profile');
  const failedDraftLink = harness(async () => ({ error: null }), false, ['tech'], true);
  walk(failedDraftLink.render()).find(node => node.type === 'Question').props.onChange('A gentle nudge');
  button(failedDraftLink.render(), 'Explore my 3MIQ').props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failedDraftLink.miqOpens(), 0, 'a failed device draft keeps the member on the check-in');
  assert.ok(walk(failedDraftLink.render()).some(node => node.props?.accessibilityRole === 'alert'));
  const techAnnouncement = text(harness(async () => ({ error: null }), false, ['tech']).render());
  assert.match(techAnnouncement, /Not in OG\?.*at cost from our shop.*Reach out to Nat with questions/);
  assert.doesNotMatch(techAnnouncement, /Honey Pot dues/);
  assert.doesNotMatch(techAnnouncement, /https?:\/\//, 'the homework does not invent a shop link');
  const deadline = text(harness(async () => ({ error: null }), false, ['tech'], false, true).render());
  assert.match(deadline, /newsletter goes out tomorrow, October 2!.*shout-outs and event plugs today/);
  assert.doesNotMatch(techAnnouncement, /newsletter goes out tomorrow/, 'the dated prompt is hidden outside its Pacific day');
  console.log('Survey completion: compact task Archive/Undo, scoped drafts, retry, and explicit save/exit passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports });
  return module.exports;
}

const { getWebSubmitKeyMode, submitOnEnter } = load(path.resolve('lib/submitOnEnter.ts'));

assert.equal(getWebSubmitKeyMode({ enabled: false, multiline: true, enterSendsOnWeb: true }), 'disabled');
assert.equal(getWebSubmitKeyMode({ enabled: true, multiline: false, enterSendsOnWeb: false }), 'plain');
assert.equal(getWebSubmitKeyMode({ enabled: true, multiline: true, enterSendsOnWeb: true }), 'plain');
assert.equal(getWebSubmitKeyMode({ enabled: true, multiline: true, enterSendsOnWeb: false }), 'modified');

let submissions = 0;
let prevented = 0;
const plain = submitOnEnter(() => { submissions += 1; });
plain({ key: 'Enter', preventDefault: () => { prevented += 1; } });
plain({ key: 'Enter', shiftKey: true });
assert.equal(submissions, 1, 'plain Enter submits once while Shift+Enter remains a newline');
assert.equal(prevented, 1, 'a submitting Enter prevents the browser newline');

const modified = submitOnEnter(() => { submissions += 1; }, { requireModifier: true });
modified({ key: 'Enter' });
modified({ key: 'Enter', metaKey: true, preventDefault: () => { prevented += 1; } });
modified({ nativeEvent: { key: 'NumpadEnter', ctrlKey: true, preventDefault: () => { prevented += 1; } } });
modified({ key: 'Enter', ctrlKey: true, shiftKey: true });
modified({ key: 'Enter', metaKey: true, isComposing: true });
assert.equal(submissions, 3, 'modified mode submits only Command/Ctrl + Enter');
assert.equal(prevented, 3, 'both modified submit shortcuts prevent a newline');

console.log('Enter: multiline web fields follow each writer; Command/Ctrl + Enter always submits.');

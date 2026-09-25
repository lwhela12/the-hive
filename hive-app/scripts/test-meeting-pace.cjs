const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports, require: (name) => imports[name], Date },
  );
  return module.exports;
}

const pace = load('lib/meetingPace.ts', { './timeInput': load('lib/timeInput.ts') });
const at = (hour, minute) => new Date(2026, 8, 25, hour, minute);

const natFirst = pace.meetingPaceDeadline(at(18, 0), '20:00', ['7:30 PM', '7:00 PM', 'No']);
assert.equal(natFirst.source, 'member');
assert.equal(natFirst.at.getHours(), 19);
assert.equal(pace.minutesUntil(at(18, 0), natFirst), 60);
assert.equal(pace.pacePerStop(60, 12), '≈5 min');

const infinityNext = pace.meetingPaceDeadline(at(19, 10), '20:00', ['7:30 PM', '7:00 PM']);
assert.equal(infinityNext.at.getMinutes(), 30);
assert.equal(pace.minutesUntil(at(19, 10), infinityNext), 20);
assert.equal(pace.pacePerStop(4, 8), 'under 1 min');

const officialFirst = pace.meetingPaceDeadline(at(18, 0), '18:45', ['7:30 PM']);
assert.equal(officialFirst.source, 'meeting');
assert.equal(pace.minutesUntil(at(18, 0), officialFirst), 45);
assert.equal(pace.meetingPaceDeadline(at(20, 1), '20:00', ['No', 'around seven']), null);

console.log('PASS: meeting pace follows the first valid future hard out, then the next, with truthful per-stop timing.');

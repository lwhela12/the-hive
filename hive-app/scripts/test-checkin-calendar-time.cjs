const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/timeInput.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: moduleObject, exports: moduleObject.exports });
const { parseCalendarTime, humanTimeInput } = moduleObject.exports;
const asJson = v => JSON.parse(JSON.stringify(v));
for (const range of ['4–7pm', '4-7pm', '4:00 pm- 7:00pm', '4 PM – 7 PM', '4pm-7']) {
  assert.deepEqual(asJson(parseCalendarTime(range)), { start: '16:00', end: '19:00' }, range);
}
assert.deepEqual(asJson(parseCalendarTime('11–1pm')), { start: '11:00', end: '13:00' });
assert.deepEqual(asJson(parseCalendarTime('4pm')), { start: '16:00', end: null });
assert.equal(parseCalendarTime('4–banana'), null);
assert.equal(humanTimeInput('19:00'), '7:00 PM');
const form = fs.readFileSync('components/surveys/CheckInCalendar.tsx', 'utf8');
assert.match(form, /event_time,end_time/);
assert.match(form, /end_time: times\?\.end \?\? null/);
assert.match(form, /humanTimeInput\(event.end_time\)/);
console.log('PASS: event time range parsing and end-time create/edit wiring.');

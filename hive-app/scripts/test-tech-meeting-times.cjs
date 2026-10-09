const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../lib/techMeetingAvailability.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('require', 'exports', output)((id) => {
  if (id === './dateUtils') return { formatDateShort: value => value, formatTimeRange: (start, end) => `${start}-${end}` };
  if (id === './timeInput') return { parseTimeInput: value => {
    const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
    return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
  } };
  throw new Error(`Unexpected import: ${id}`);
}, api);

const poll = { meetingId: 'october-tech', options: [
  { date: '2026-11-10', start: '17:00', end: '19:00' },
  { date: '2026-11-12', start: '18:00', end: '20:00' },
  { date: '2026-11-14', start: '12:00', end: '14:00' },
] };
const [first, second] = poll.options.map(api.meetingTimeId);
assert.equal(api.readMeetingTimePoll({ techMeetingTimePoll: poll }, 'october-tech')?.options.length, 3);
assert.equal(api.readMeetingTimePoll({ techMeetingTimePoll: poll }, 'november-tech'), null, 'old choices do not appear in another meeting');
assert.equal(api.normalizeMeetingTimeOptions([{ date: '2026-02-30', start: '17:00', end: '19:00' }]).length, 0, 'invalid dates are rejected');

const tally = api.tallyMeetingTimes(poll, [
  { meetingId: 'october-tech', choices: { [first]: 'yes', [second]: 'maybe' }, favorite: first },
  { meetingId: 'october-tech', choices: { [first]: 'no', [second]: 'yes' }, favorite: second },
  { meetingId: 'october-tech', choices: { [first]: 'maybe', [second]: 'no' }, favorite: first, suggestion: 'Saturday evening' },
  { meetingId: 'september-tech', choices: { [first]: 'yes' }, favorite: first },
]);
assert.equal(tally.responded, 3, 'the absent member who answered still counts, but an old meeting does not');
assert.deepEqual(tally.rows.slice(0, 2).map(row => [row.yes, row.maybe, row.no, row.favorite]), [[1, 1, 1, 2], [1, 1, 1, 1]]);
assert.deepEqual(tally.suggestions, ['Saturday evening']);
console.log('Tech meeting time poll test passed');

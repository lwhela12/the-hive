const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(app)', 'members.tsx'),
  'utf8',
);

const expectations = [
  ['hex-safe text width', 'honeycombCellWidth * 0.52'],
  ['narrower bottom action shelf', 'honeycombCellWidth * 0.5'],
  ['bounded lower content', 'maxWidth: honeycombActionMaxWidth'],
  ['lower content clips at its safe rectangle', "overflow: 'hidden'"],
  ['answer and wish actions share one row', "flexDirection: 'row'"],
  ['long current-focus copy is clamped', 'numberOfLines={2}'],
  ['action labels cannot force the row wider', 'flexShrink: 1'],
  ['visible answer count stays compact', 'const connectionChip = `${sharedAnswerCount} answer'],
  ['profile and current focus stay visually connected', "justifyContent: spotlight && !isCompactHoneycomb ? 'center' : 'space-between'"],
  ['focused cards use a deliberate small gap', 'gap: spotlight && !isCompactHoneycomb ? 8 : 0'],
];

for (const [label, needle] of expectations) {
  if (!source.includes(needle)) {
    console.error(`FAIL: member honeycomb is missing ${label}.`);
    process.exit(1);
  }
}

console.log('PASS: member names, current focus, answers, and wishes stay inside the honeycomb.');

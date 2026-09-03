import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

/**
 * A survey wears its own HIVE's colour.
 *
 * Nat, 2026-09-01: every check-in inside Tech HIVE and Production HIVE was
 * still honey gold — the number chips, the selected answers, the submit
 * button — in a HIVE whose entire shell is blue or purple. The two survey
 * files imported `hiveBrand` zero times; every accent was typed in by hand.
 *
 * Hand-written branding is how one HIVE ends up wearing another's costume, so
 * the accent now arrives as a prop and gold's exact family comes back from
 * `accentPalette` — OG does not move a pixel. This guard fails the build if a
 * gold gets typed straight back in.
 */
const GOLDS = [
  ['#bd9348', 'the accent — use `tint.accent`'],
  ['#8a5a16', 'gold’s deep ink — use `tint.ink`'],
  ['#fdf3dc', 'the gold wash — use `tint.wash`'],
  ['rgba(222,193,129,', 'a gold border — use `tint.line(alpha)`'],
];

for (const file of ['components/surveys/SurveyModal.tsx', 'components/surveys/SurveyQuestionField.tsx']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');

  if (!source.includes('accentPalette')) {
    failures.push(`${file} must take its colour from accentPalette(), not from a typed-in hex.`);
  }

  // The carry-forward STATUS palette is semantic, not brand — keep_active is
  // amber because it means "still going", in every HIVE. Skip that block, and
  // only that block.
  let inStatusPalette = false;
  source.split('\n').forEach((line, index) => {
    if (line.startsWith('const CARRY_FORWARD_STATUS_STYLE')) inStatusPalette = true;
    else if (inStatusPalette && line.startsWith('};')) inStatusPalette = false;
    if (inStatusPalette) return;
    for (const [gold, fix] of GOLDS) {
      if (line.includes(gold)) {
        failures.push(`${file}:${index + 1} hard-codes ${gold} (${fix}).`);
      }
    }
  });
}

// The status palette is allowed its own colours, so make sure it is still the
// only thing between here and a file full of typed-in gold.
const modal = fs.readFileSync(path.join(root, 'components/surveys/SurveyModal.tsx'), 'utf8');
if (!modal.includes('survey.community_id == null ? HIVE_GOLD')) {
  failures.push(
    'SurveyModal must decide the accent from the SURVEY — a HIVE-Wide survey (community_id null) stays gold however blue the page behind it is.'
  );
}

if (failures.length) {
  console.error('Survey colour: every check-in wears its own HIVE.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Survey colour: every check-in wears its own HIVE.');

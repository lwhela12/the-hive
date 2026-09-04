#!/usr/bin/env node
/**
 * ONE TRUTH ABOUT WHAT A CHECK-IN IS, CHECKED ON EVERY BUILD.
 *
 * A survey's TITLE IS ITS TYPE — there is no `kind` column — so the regexes
 * that read a title are load-bearing in a way that ordinary strings are not.
 * `supabase/functions/_shared/checkInPatterns.ts` exists because they used to
 * live in two files with a comment saying "change one, change both", and on
 * 2026-08-15 somebody changed one. Nat, that afternoon: *"the same truth
 * written twice ... that's part of why today's break happened."*
 *
 * The comment came back anyway, because the shared file cannot be imported
 * everywhere it is needed: the app's tsconfig excludes `supabase/functions`
 * (it is Deno), and Postgres cannot import TypeScript at all. So there are
 * legitimately four transcriptions, and this replaces the comment that asked a
 * person to keep them in step with a build step that will not let them drift.
 *
 * On 2026-09-04 the cost of the drift showed up on a screen: Production's
 * end-of-month row was still titled "Halfway check-in", which the DISPLAY
 * pattern recognised and the MATCHER — an exact-title list, a fifth private
 * copy of the same idea — did not. Two "End of the month" items on one Home,
 * and nothing anywhere reporting a problem.
 *
 * WHAT THIS FAILS ON
 *   1. A registered copy whose regex no longer matches the shared file's.
 *   2. A NEW copy nobody registered — any `*_CHECK_IN_PATTERN` or
 *      `*_TITLE_PATTERN` regex in the app that is not in COPIES below. A fifth
 *      private list is exactly what caused this, so appearing is the failure.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const SHARED = 'supabase/functions/_shared/checkInPatterns.ts';

/** NAME -> the regex's source, straight off the shared file. */
function sourceOfTruth() {
  const text = read(SHARED);
  const found = new Map();
  for (const m of text.matchAll(/export const (\w+_PATTERN)\s*=\s*\n?\s*\/(.+?)\/i;/g)) {
    found.set(m[1], m[2]);
  }
  if (found.size < 6) {
    fail(`${SHARED} defines ${found.size} patterns — expected the six this app is built on. Has the file changed shape?`);
  }
  return found;
}

/**
 * Every transcription, named. A copy that is here and correct is fine; a copy
 * that is here and wrong fails; a copy that is NOT here fails as undeclared.
 */
const COPIES = [
  { file: 'lib/checkIns.ts', local: 'PRE_MEETING_TITLE_PATTERN', truth: 'PRE_MEETING_CHECK_IN_PATTERN' },
  { file: 'lib/checkIns.ts', local: 'END_OF_MONTH_TITLE_PATTERN', truth: 'END_OF_MONTH_CHECK_IN_PATTERN' },
  { file: 'lib/hooks/useSurveys.ts', local: 'MONTHLY_CHECK_IN_PATTERN', truth: 'MONTHLY_CHECK_IN_PATTERN' },
  { file: 'app/(app)/admin.tsx', local: 'MONTHLY_CHECK_IN_PATTERN', truth: 'MONTHLY_CHECK_IN_PATTERN' },
];

/**
 * The app's own patterns that are deliberately NOT transcriptions.
 *
 * `useSurveys`'s two are narrower on purpose — they decide which MONTH an
 * answer is filed under, and a period key is not the place to start honouring
 * titles nothing sends any more. The note above each of them says so. They are
 * listed so the undeclared-copy check stays a real check.
 */
const DELIBERATELY_DIFFERENT = [
  { file: 'lib/hooks/useSurveys.ts', local: 'HALFWAY_CHECK_IN_PATTERN' },
  { file: 'lib/hooks/useSurveys.ts', local: 'PRE_MEETING_CHECK_IN_PATTERN' },
];

/** The Postgres transcription, in the migration that made the rule a rule. */
const MIGRATION = 'supabase/migrations/230_one_check_in_of_a_kind.sql';

const problems = [];
const fail = (m) => { problems.push(m); };

const truth = sourceOfTruth();

/* 1. Every registered copy says the same thing. ---------------------------- */
for (const copy of COPIES) {
  const text = read(copy.file);
  const m = text.match(new RegExp(`(?:export )?const ${copy.local}\\s*(?::[^=]+)?=\\s*\\n?\\s*/(.+?)/i;`));
  if (!m) {
    fail(`${copy.file}: ${copy.local} is registered in the lint but no longer defined there. Delete the entry or restore the constant.`);
    continue;
  }
  const want = truth.get(copy.truth);
  if (m[1] !== want) {
    fail(
      `${copy.file}: ${copy.local} has drifted from ${copy.truth} in ${SHARED}.\n` +
      `      here:   /${m[1]}/i\n` +
      `      shared: /${want}/i\n` +
      `      A check-in is recognised by its title, so these two disagreeing means one screen treats a row as a check-in and another does not.`
    );
  }
}

/* 2. Nobody has quietly started a fifth copy. ------------------------------ */
const declared = new Set([
  ...COPIES.map((c) => `${c.file}:${c.local}`),
  ...DELIBERATELY_DIFFERENT.map((c) => `${c.file}:${c.local}`),
]);
const appFiles = globSync('{app,components,lib}/**/*.{ts,tsx}', { cwd: ROOT });
for (const file of appFiles) {
  const text = readFileSync(path.join(ROOT, file), 'utf8');
  for (const m of text.matchAll(/(?:export )?const (\w*(?:CHECK_IN|TITLE)_PATTERN)\s*(?::[^=]+)?=\s*\n?\s*\//g)) {
    const key = `${file}:${m[1]}`;
    if (!declared.has(key)) {
      fail(
        `${file}: ${m[1]} is a new copy of how a check-in is recognised, and nothing is keeping it in step.\n` +
        `      Register it in COPIES in scripts/lint-check-in-kinds.mjs (if it should match ${SHARED}) or in DELIBERATELY_DIFFERENT with a note saying why it must not.`
      );
    }
  }
}

/* 3. And Postgres agrees with all of it. ----------------------------------- */
const sql = read(MIGRATION);
const sqlPatterns = [...sql.matchAll(/title ~\* '([^']+)'\s*\n?\s*then '(\w+)'/g)]
  .reduce((acc, m) => { acc[m[2]] = m[1]; return acc; }, {});
const expectedSql = {
  year: truth.get('END_OF_YEAR_CHECK_IN_PATTERN'),
  quarter: truth.get('QUARTERLY_CHECK_IN_PATTERN'),
  endofmonth: truth.get('END_OF_MONTH_CHECK_IN_PATTERN'),
  // Postgres folds the two into one kind: a HIVE's monthly check-in IS its
  // before-we-meet, which is what `checkInDisplayName` has said since 09-02.
  premeeting: `(${truth.get('PRE_MEETING_CHECK_IN_PATTERN')}|${truth.get('MONTHLY_CHECK_IN_PATTERN')})`,
};
for (const [kind, want] of Object.entries(expectedSql)) {
  const got = sqlPatterns[kind];
  if (got === undefined) {
    fail(`${MIGRATION}: check_in_kind() no longer classifies '${kind}'. The database's rule and the app's would stop agreeing about which rows collide.`);
  } else if (got !== want) {
    fail(
      `${MIGRATION}: check_in_kind()'s '${kind}' pattern has drifted from ${SHARED}.\n` +
      `      here:   ${got}\n` +
      `      shared: ${want}`
    );
  }
}

if (problems.length) {
  console.error('\n✗ How a check-in is recognised is written in more than one place, and the copies disagree:\n');
  for (const p of problems) console.error(`  • ${p}\n`);
  process.exit(1);
}
console.log('✓ check-in patterns: every copy says the same thing');

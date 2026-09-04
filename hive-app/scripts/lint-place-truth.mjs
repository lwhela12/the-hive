import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

/**
 * ONE ANSWER TO "WHERE AM I STANDING", AND EVERYTHING READS IT.
 *
 * Nat has reported the same thing five times across three weeks, each time on a
 * different screen:
 *
 * - 2026-08-21, on a meeting opened from a link: *"it looks like i'm in HIVE
 *   wide & in a meeting, thats not good."*
 * - 2026-09-02, on Admin: *"I should be in HIVE-Wide admin and it still looks
 *   like I'm in Tech HIVE on the left, and according to the breadcrumbs at the
 *   bottom."*
 * - 2026-09-04, on HIVE-Wide Boards: *"its showing me the correct hive wide
 *   boards & header, but the left hand side still looks like OG HIVE & the
 *   footer says OG HIVE boards....its NEVER consistent."*
 *
 * Every one of them was fixed by hand, on the page she happened to be looking
 * at, and every one of them came back somewhere else — because the answer was
 * being worked out separately in four places that could disagree: two
 * allow-lists that covered different routes, the switch router's own lookup,
 * and a patch in the rail that read the active nav key.
 *
 * `placeForRoute` in `lib/navigation.ts` is the single table now. This guard
 * runs it — really runs it, on the real destination list — and fails the build
 * if any of the four ever stop agreeing, or if a component starts working the
 * answer out for itself again.
 *
 * There is no test runner in this repo, so the two modules are transpiled with
 * the TypeScript that is already a dependency and imported as plain ESM.
 */

// --------------------------------------------------------------------------
// Run the real table.
// --------------------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-place-'));
const compile = (name) => {
  const source = fs.readFileSync(path.join(root, 'lib', `${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  fs.writeFileSync(
    path.join(tmp, `${name}.mjs`),
    outputText.replace(/from ['"]\.\/navigation['"]/g, "from './navigation.mjs'"),
  );
};
compile('navigation');
compile('hiveSwitchRoute');

const nav = await import(pathToFileURL(path.join(tmp, 'navigation.mjs')).href);
const { routeAfterHiveSwitch } = await import(
  pathToFileURL(path.join(tmp, 'hiveSwitchRoute.mjs')).href
);
fs.rmSync(tmp, { recursive: true, force: true });

const {
  NAV_DESTINATIONS, ADMIN_DESTINATION, HIVE_WIDE_ROUTE,
  placeForRoute, routeLivesAtWholeHive, routeDemandsWholeHive,
} = nav;

const check = (ok, message) => { if (!ok) failures.push(message); };

// The two published questions must be nothing more than views of the table.
// If either grows an opinion of its own, the pages drift apart again.
for (const route of [
  HIVE_WIDE_ROUTE, '/hive-wide-boards', '/board', '/buzz', '/hive', '/members',
  '/messages', '/meetings', '/admin', '/profile', '/app-feedback', '/settings',
  '/honey-pot', '/meeting-helper', '/', '/checkin/og', '/halfway/og',
  '/approve/abc', '/endofmonth', '/beforewemeet', '/some-page-nobody-has-written-yet',
]) {
  const place = placeForRoute(route);
  check(
    routeLivesAtWholeHive(route) === (place !== 'hive'),
    `routeLivesAtWholeHive('${route}') disagrees with placeForRoute (='${place}').`,
  );
  check(
    routeDemandsWholeHive(route) === (place === 'wide'),
    `routeDemandsWholeHive('${route}') disagrees with placeForRoute (='${place}').`,
  );
}

// An unwritten route is HIVE-only. The allow-list is the safe way round: a page
// added next month shows one HIVE's answer rather than wearing HIVE-Wide's name.
check(
  placeForRoute('/some-page-nobody-has-written-yet') === 'hive',
  'An unknown route must answer "hive" — the list is an allow-list on purpose.',
);

for (const d of [...NAV_DESTINATIONS, ADMIN_DESTINATION]) {
  const place = placeForRoute(d.route);
  const label = `${d.key} (${d.route}, atWholeHive: ${d.atWholeHive ?? 'unset'})`;

  if (d.wideRoute) {
    // A page with a wide twin is split in two: its own route is the one-HIVE
    // half, and the twin only exists above the HIVEs. This is the pair that was
    // missed for Boards, and it is the pair Nat found on 2026-09-04.
    check(place === 'hive', `${label}: has a wide twin, so its own route must be "hive", not "${place}".`);
    check(
      placeForRoute(d.wideRoute) === 'wide',
      `${label}: its wide twin ${d.wideRoute} must be "wide" — otherwise nothing steps the reader up and the rail keeps the last HIVE's colour.`,
    );
    check(
      routeDemandsWholeHive(d.wideRoute),
      `${label}: ${d.wideRoute} must DEMAND HIVE-Wide, so a link, a bookmark or the back button lands with the rail and footer already right.`,
    );
    check(
      routeAfterHiveSwitch(d.wideRoute, 'wide') === null,
      `${label}: pressing HIVE-Wide while already on ${d.wideRoute} must stay put, not throw the reader back to the landing page.`,
    );
    check(
      routeAfterHiveSwitch(d.wideRoute, 'hive') === d.route,
      `${label}: coming down from ${d.wideRoute} must land on ${d.route}.`,
    );
    check(
      routeAfterHiveSwitch(d.route, 'wide') === d.wideRoute,
      `${label}: going up from ${d.route} must land on ${d.wideRoute}.`,
    );
  }

  if (d.atWholeHive === 'hidden') {
    check(place === 'hive', `${label}: hidden pages mean one HIVE, so the route must be "hive", not "${place}".`);
  }

  if (d.atWholeHive === 'only') {
    check(place === 'wide', `${label}: "only" pages live above the HIVEs, so the route must be "wide", not "${place}".`);
    check(
      routeAfterHiveSwitch(d.route, 'wide') === null,
      `${label}: pressing HIVE-Wide while already on ${d.route} must stay put.`,
    );
  }

  if (d.atWholeHive === 'same') {
    check(place === 'either', `${label}: "same" means the same page in both places, so the route must be "either", not "${place}".`);
    check(
      routeAfterHiveSwitch(d.route, 'wide') === null && routeAfterHiveSwitch(d.route, 'hive') === null,
      `${label}: changing place while reading a "same" page must leave the reader on it.`,
    );
  }

  if (d.atWholeHive === 'wide' && !d.wideRoute) {
    check(place === 'either', `${label}: one screen serving both places must be "either", not "${place}".`);
  }
}

// --------------------------------------------------------------------------
// Nobody works the answer out for themselves.
// --------------------------------------------------------------------------

/**
 * `wholeHive` off the auth context is the answer, and nobody re-derives it.
 *
 * The rail carried `wholeHive || activeKey === 'hive-wide'` for a month. It was
 * a reasonable-looking patch and it is precisely how the bug survived: it made
 * ONE route look right — the landing page — while HIVE-Wide Boards and Admin
 * went on drawing the last HIVE's colour and page list under a HIVE-Wide
 * header. A local fix to a shared fact hides the shared fact being wrong.
 *
 * So: working the place out from the path or the active nav key belongs to
 * `lib/navigation.ts` and nowhere else. Everything that draws reads `wholeHive`
 * off the context, which is derived from the route and cannot disagree with
 * the address bar.
 */
const MAY_ASK_THE_ROUTE = new Set([
  'lib/navigation.ts',
  'lib/hiveSwitchRoute.ts',
  'app/_layout.tsx',
  'app/(app)/_layout.tsx',
]);

const STAND_INS = [
  [/activeKey\w*\s*===\s*['"]hive-wide['"]/, "compares the active nav key to 'hive-wide'"],
  [/activeKeyForPath\([^)]*\)\s*===\s*['"]hive-wide['"]/, "compares activeKeyForPath() to 'hive-wide'"],
  [/pathname\s*===\s*(HIVE_WIDE_ROUTE|['"]\/hive-wide['"])/, 'compares the pathname to the HIVE-Wide route'],
  [/pathname[?.]*\.startsWith\(\s*(HIVE_WIDE_ROUTE|['"]\/hive-wide['"])/, 'tests the pathname for the HIVE-Wide route'],
];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.tsx?$/.test(entry.name) ? [full] : [];
});

for (const file of [
  ...walk(path.join(root, 'app')),
  ...walk(path.join(root, 'components')),
  ...walk(path.join(root, 'lib')),
]) {
  const relative = path.relative(root, file);
  if (MAY_ASK_THE_ROUTE.has(relative)) continue;
  const source = fs.readFileSync(file, 'utf8');
  source.split('\n').forEach((line, index) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    for (const [pattern, what] of STAND_INS) {
      if (!pattern.test(line)) continue;
      failures.push(
        `${relative}:${index + 1} ${what} to work out where the reader is standing. ` +
        'Read `wholeHive` from useAuth() instead — it is derived from the route in ' +
        'app/_layout.tsx and cannot disagree with the address bar.',
      );
    }
  });
}

if (failures.length) {
  console.error('\nWhere-am-I-standing check failed:\n');
  for (const f of failures) console.error(`  • ${f}`);
  console.error('');
  process.exit(1);
}

console.log('Place truth: one table, and every page agrees with it.');

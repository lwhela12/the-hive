const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(file) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require });
  return exports;
}

const dates = load('lib/dateUtils.ts');
const schedule = load('lib/whatsNextFormat.ts');
const audience = load('lib/eventDisplay.ts');

assert.equal(dates.formatDateShort('2026-09-04'), 'Sept 4');
assert.equal(dates.formatDateRangeShort('2026-09-04', '2026-09-12'), 'Sept 4-12');
assert.equal(dates.formatDateRangeShort('2026-09-30', '2026-10-02'), 'Sept 30-Oct 2');
assert.equal(dates.formatTime('18:00:00'), '6pm');
assert.equal(dates.formatTime('18:30:00'), '6:30pm');
assert.equal(dates.formatTimeRange('17:00:00', '19:00:00'), '5-7pm');
assert.equal(dates.formatTimeRange('11:00:00', '13:00:00'), '11am-1pm');

assert.equal(schedule.whatsNextDateLabel('2026-08-06', '2026-09-07', '2026-09-08'), 'Now');
assert.equal(schedule.whatsNextIsOverdue('2026-08-06', '2026-09-07', '2026-09-08'), false);
assert.equal(schedule.whatsNextDateLabel('2026-08-06', '2026-09-09', '2026-09-08'), '1 day late');
assert.equal(schedule.whatsNextIsOverdue('2026-08-06', '2026-09-09', '2026-09-08'), true);

assert.equal(audience.eventAudienceLabel({ visibility: 'public', invited_scope: 'public' }, 'OG HIVE'), 'Public');
assert.equal(audience.eventAudienceLabel({ visibility: 'all_hives', invited_scope: 'all_hives' }, 'OG HIVE'), 'HIVE-Wide');
assert.equal(audience.eventAudienceLabel({ visibility: 'all_hives', invited_scope: 'members' }, 'OG HIVE'), 'OG HIVE');
assert.equal(audience.isUpcomingEventVisibleOnHiveWide({ visibility: 'members' }), false);
assert.equal(audience.isUpcomingEventVisibleOnHiveWide({ visibility: 'all_hives' }), true);
assert.equal(audience.isUpcomingEventVisibleOnHiveWide({ visibility: 'public' }), true);
assert.equal(
  audience.canShareEventDetailsOnHiveWide({ visibility: 'all_hives', invited_scope: 'members' }),
  false,
  'a HIVE-Wide-visible, OG-only invitation keeps its details inside OG HIVE',
);
assert.equal(audience.canShareEventDetailsOnHiveWide({ visibility: 'all_hives', invited_scope: 'all_hives' }), true);
assert.equal(audience.canShareEventDetailsOnHiveWide({ visibility: 'public', invited_scope: 'public' }), true);

const whatsNext = fs.readFileSync('lib/hooks/useWhatsNext.ts', 'utf8');
assert.doesNotMatch(whatsNext, /event_time\?\.slice\(0, 5\)/, 'What’s Next never displays raw 24-hour meeting time');
assert.doesNotMatch(whatsNext, /through \$\{event\.end_date\}/, 'What’s Next never prints an ISO range');
for (const promise of ['formatDateRangeShort(', 'formatTimeRange(', 'eventAudienceLabel(', 'whatsNextIsOverdue(', 'queryKeys.whatsNext(', 'useFocusEffect(']) {
  assert.ok(whatsNext.includes(promise), `What’s Next is missing shared continuity rule: ${promise}`);
}
assert.match(whatsNext, /view === 'hiveWideUpcomingEvents'/, 'HIVE-Wide Home has a distinct upcoming-events view');
assert.match(whatsNext, /isUpcomingEventVisibleOnHiveWide\(meeting\)/, 'HIVE-Wide Home excludes private meetings');
assert.match(whatsNext, /isUpcomingEventVisibleOnHiveWide\(event\)/, 'HIVE-Wide Home excludes private calendar events');
assert.match(whatsNext, /canShareEventDetailsOnHiveWide\(event\)/, 'HIVE-Wide Home hides details for HIVE-only invitations');

const hiveWideHome = fs.readFileSync('app/(app)/hive-wide.tsx', 'utf8');
assert.match(hiveWideHome, /label="Upcoming Events"/);
assert.match(hiveWideHome, /view="hiveWideUpcomingEvents"/);

const adminPanel = fs.readFileSync('components\/admin\/WhatsNextPanel.tsx', 'utf8');
assert.match(adminPanel, /title="Upcoming Events"/);

const eventQueries = fs.readFileSync('lib/eventQueries.ts', 'utf8');
assert.match(eventQueries, /event_date\.gte\.\$\{today\},end_date\.gte\.\$\{today\}/);
for (const file of ['lib/hooks/useHiveDataQuery.ts', 'lib/hooks/usePrefetchAppData.ts']) {
  assert.match(fs.readFileSync(file, 'utf8'), /communityEventsQueryOptions\(/, `${file} must share the canonical event query`);
}

const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
assert.match(layout, /table: 'events'/, 'the app shell listens for canonical event changes');
assert.match(layout, /invalidateEventQueries\(\)/, 'live event changes invalidate every event surface');

console.log('PASS: event ranges, dates, times, audiences, cache reads, and live refresh share one continuity contract.');

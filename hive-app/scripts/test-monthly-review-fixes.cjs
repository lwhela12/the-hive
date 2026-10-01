const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => load(path.resolve(path.dirname(file), `${name}.ts`)), Intl, Date });
  return module.exports;
}

const events = load(path.resolve('supabase/functions/_shared/upcomingEvents.ts'));
const { surveyCalendarWindow, buzzCalendarItems } = load(path.resolve('lib/buzzCalendar.ts'));
const { wideMonthTodo, wideCompletedMonthTodo } = load(path.resolve('lib/wideCheckInTodos.ts'));
const at = iso => new Date(iso);
assert.equal(events.pacificDay(at('2026-10-01T06:59:00Z')), '2026-09-30');
assert.equal(events.pacificDay(at('2026-10-01T07:00:00Z')), '2026-10-01');
assert.equal(events.pacificDay(at('2026-12-01T07:30:00Z')), '2026-11-30', 'winter Pacific uses standard time');
const { start, end } = events.upcomingWindow('2026-10-01');
assert.equal(start, '2026-10-01');
assert.equal(end, '2026-11-15');
const meetingDates = [
  { community_id: 'og', event_date: '2026-11-03' },
  { community_id: 'tech', event_date: '2026-10-12' },
  { community_id: 'production', event_date: '2026-10-04' },
];
assert.equal(surveyCalendarWindow(start, ['og'], meetingDates).end, '2026-11-03', 'next meeting may cross month end');
assert.equal(surveyCalendarWindow(start, ['tech'], meetingDates).end, '2026-10-12');
assert.equal(surveyCalendarWindow(start, ['og', 'tech'], meetingDates).end, '2026-10-12', 'shared check-in uses earliest eligible meeting');
assert.equal(surveyCalendarWindow(start, ['og', 'tech'], meetingDates).meetingDate, '2026-10-12');
assert.equal(surveyCalendarWindow(start, ['og'], [{ community_id: 'production', event_date: '2026-10-04' }]).meetingDate, null,
  'secret Production meeting does not set an OG member’s window');
assert.equal(surveyCalendarWindow(start, ['og'], []).end, end, 'missing meeting uses labeled 45-day fallback');
const wide = { title: 'October First Friday', event_date: '2026-10-02', event_type: 'custom', visibility: 'all_hives', invited_scope: 'all_hives', community: { slug: 'default' } };
const publicEvent = { ...wide, title: 'Open art walk', visibility: 'public', invited_scope: 'public' };
for (const day of ['02', '09', '10', '12', '24', '31']) {
  assert.equal(events.eligibleUpcomingEvent({ ...wide, event_date: `2026-10-${day}` }, 'hive_wide', start, end), true);
}
assert.equal(events.eligibleUpcomingEvent(wide, 'public', start, end), false);
assert.equal(events.eligibleUpcomingEvent(publicEvent, 'public', start, end), true);
assert.equal(events.eligibleUpcomingEvent({ ...publicEvent, invited_scope: 'members' }, 'public', start, end), false);
assert.equal(events.eligibleUpcomingEvent({ ...publicEvent, community: { slug: 'show' } }, 'public', start, end), false);
assert.equal(events.eligibleUpcomingEvent({ ...wide, visibility: 'members' }, 'hive_wide', start, end), false);
assert.equal(events.eligibleUpcomingEvent({ ...publicEvent, event_type: 'birthday' }, 'public', start, end), false);
assert.equal(events.eligibleUpcomingEvent({ ...publicEvent, event_date: '2026-09-30' }, 'public', start, end), false);
assert.equal(events.eligibleUpcomingEvent({ ...wide, event_date: '2026-11-03' }, 'hive_wide', start, '2026-11-03'), true,
  'meeting day is included even after month end');
assert.equal(events.eligibleUpcomingEvent({ ...wide, event_date: '2026-11-04' }, 'hive_wide', start, '2026-11-03'), false);
assert.equal(events.eligibleUpcomingEvent({ ...wide, event_type: 'meeting', visibility: 'members', event_date: '2026-10-12' }, 'hive_wide', start, '2026-10-12'), false);
assert.equal(buzzCalendarItems([{ ...wide, id: 'same' }, { ...wide, id: 'same' }], []).length, 1, 'one shared event appears once');

const survey = { id: 'survey', title: 'End of the month' };
const sept = at('2026-10-01T18:00:00Z');
const receipt = { survey_id: 'survey', community_id: null, occurrence: 'month:2026-09' };
assert.equal(wideMonthTodo(survey, [], true, sept).done, false);
assert.equal(wideMonthTodo(survey, [{ ...receipt, community_id: 'og' }], true, sept).done, false);
assert.equal(wideMonthTodo(survey, [receipt], true, sept).done, true);
assert.equal(wideMonthTodo(survey, [], true, sept, [{ survey_id: 'survey', community_id: null, response_period: '2026-09' }]).done, true,
  'a legacy shared answer still counts as completed');
assert.equal(wideMonthTodo(survey, [], true, sept, [{ survey_id: 'survey', community_id: 'og', response_period: '2026-09' }]).done, false,
  'one HIVE section does not finish the shared check-in');
assert.equal(wideMonthTodo(survey, [receipt], true, sept).destination, '/endofmonth');
assert.equal(wideMonthTodo(survey, [receipt], true, sept).due_date, '2026-09-30');
assert.equal(wideMonthTodo(survey, [receipt], false, sept), null);
assert.equal(wideMonthTodo(survey, [receipt], true, at('2026-10-07T18:00:00Z')).done, true);
assert.equal(wideMonthTodo(survey, [receipt], true, at('2026-10-08T18:00:00Z')).destination, '/endofmonth?review=2026-09');
assert.equal(wideMonthTodo(survey, [], true, at('2026-10-08T18:00:00Z')), null, 'closed incomplete month does not linger');
assert.equal(wideMonthTodo(survey, [{ ...receipt, community_id: 'og' }], true, at('2026-10-08T18:00:00Z')), null);
assert.equal(wideMonthTodo(survey, [receipt, { ...receipt, occurrence: 'month:2026-08' }], true, at('2026-10-08T18:00:00Z')).id, 'month:survey:2026-09');
assert.equal(wideMonthTodo(survey, [receipt], true, at('2026-10-29T18:00:00Z')).done, false);
assert.equal(wideCompletedMonthTodo(survey, [receipt], true, at('2026-10-29T18:00:00Z')).destination, '/endofmonth?review=2026-09',
  'a prior Done receipt remains reviewable while the new month is open');

const channel = c => parseInt(c, 16) / 255;
const light = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = hex => [1, 3, 5].map(i => light(channel(hex.slice(i, i + 2)))).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
assert.ok((luminance('#f5eddc') + 0.05) / (luminance('#313130') + 0.05) >= 4.5, '3MIQ link clears normal text contrast on mobile');
console.log('Monthly review: Pacific boundary, next-meeting window, six October events, public/private scope, completion grace and contrast passed.');

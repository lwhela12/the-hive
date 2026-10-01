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
const { surveyCalendarWindow, eligibleSurveyMeeting, buzzCalendarItems } = load(path.resolve('lib/buzzCalendar.ts'));
const { shouldReturnToCheckIn } = load(path.resolve('lib/boardCheckInReturn.ts'));
const { isInvitedToEvent, canShareEventDetailsOnHiveWide } = load(path.resolve('lib/eventDisplay.ts'));
const { wideMonthTodo, wideCompletedMonthTodo } = load(path.resolve('lib/wideCheckInTodos.ts'));
const at = iso => new Date(iso);
assert.equal(events.pacificDay(at('2026-10-01T06:59:00Z')), '2026-09-30');
assert.equal(events.pacificDay(at('2026-10-01T07:00:00Z')), '2026-10-01');
assert.equal(events.pacificDay(at('2026-12-01T07:30:00Z')), '2026-11-30', 'winter Pacific uses standard time');
const { start, end } = events.upcomingWindow('2026-10-01');
assert.equal(start, '2026-10-01');
assert.equal(end, '2026-11-15');
const meetingDates = [
  { id: 'og-meeting', title: 'OG HIVE — Oct', event_type: 'meeting', community_id: 'og', community: { slug: 'default' }, event_date: '2026-10-28', event_time: '17:30', visibility: 'members', invited_scope: 'members' },
  { id: 'tech-meeting', title: 'Tech HIVE — October', event_type: 'meeting', community_id: 'tech', community: { slug: 'tech' }, event_date: '2026-10-08', event_time: '17:00', visibility: 'all_hives', invited_scope: 'members' },
  { id: 'production-meeting', title: 'Secret Production meeting', event_type: 'meeting', community_id: 'production', community: { slug: 'show' }, event_date: '2026-10-04', visibility: 'members' },
];
assert.equal(surveyCalendarWindow(start, meetingDates).end, '2026-10-28', 'earlier Tech meeting does not truncate the OG window');
assert.equal(surveyCalendarWindow(start, meetingDates).meetingDate, '2026-10-28');
assert.equal(surveyCalendarWindow('2026-10-29', [{ ...meetingDates[0], event_date: '2026-11-03' }]).end, '2026-11-03',
  'next OG meeting can cross month end');
assert.equal(surveyCalendarWindow(start, [meetingDates[1], meetingDates[2]]).meetingDate, null,
  'Tech and secret Production do not set the OG window');
assert.equal(surveyCalendarWindow(start, []).end, end, 'invisible OG meeting uses labeled 45-day fallback');
assert.equal(eligibleSurveyMeeting(meetingDates[0], ['og'], start, '2026-10-28'), true, 'OG member sees own private meeting');
assert.equal(eligibleSurveyMeeting(meetingDates[0], ['tech'], start, '2026-10-28'), false, 'Tech-only member sees no OG-private name');
assert.equal(eligibleSurveyMeeting(meetingDates[1], ['og'], start, '2026-10-28'), true, 'shared Tech meeting appears beside OG');
assert.equal(eligibleSurveyMeeting(meetingDates[1], ['og'], start, '2026-10-07'), false);
assert.equal(eligibleSurveyMeeting(meetingDates[2], ['production'], start, '2026-10-28'), false, 'Production stays out of survey');
assert.equal(buzzCalendarItems(meetingDates.filter(meeting => eligibleSurveyMeeting(meeting, ['og'], start, '2026-10-28')), []).length, 2);
assert.equal(isInvitedToEvent(meetingDates[0], ['og']), true, 'OG member can see own meeting time');
assert.equal(isInvitedToEvent(meetingDates[1], ['og']), false, 'Tech meeting invitation is not expanded to OG');
assert.equal(canShareEventDetailsOnHiveWide(meetingDates[1]), false, 'Tech meeting time stays private on the shared view');
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
assert.equal(events.eligibleUpcomingEvent({ ...wide, event_date: '2026-10-31' }, 'hive_wide', start, '2026-10-28'), false,
  'Oct 31 falls beyond the real next OG meeting cutoff');
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

for (const visit of ['first-visit', 'second-visit']) {
  assert.equal(shouldReturnToCheckIn('endofmonth', 'help-board', 'help-board', visit, true), true,
    'each check-in visit returns from its linked Help board');
}
assert.equal(shouldReturnToCheckIn(null, 'help-board', 'help-board', null, true), false, 'direct board entry keeps normal Back');
assert.equal(shouldReturnToCheckIn('endofmonth', 'help-board', 'another-board', 'first-visit', true), false,
  'browsing another board supersedes the check-in return');
assert.equal(shouldReturnToCheckIn('endofmonth', 'help-board', 'help-board', 'first-visit', false), false,
  'a completed visit cannot override later navigation');
assert.equal(shouldReturnToCheckIn('endofmonth', 'help-board', 'help-board', null, true), false,
  'a direct URL with only an origin label does not claim the check-in');

const channel = c => parseInt(c, 16) / 255;
const light = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = hex => [1, 3, 5].map(i => light(channel(hex.slice(i, i + 2)))).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
assert.ok((luminance('#f5eddc') + 0.05) / (luminance('#313130') + 0.05) >= 4.5, '3MIQ link clears normal text contrast on mobile');
console.log('Monthly review: Pacific boundary, next-meeting window, six October events, public/private scope, completion grace and contrast passed.');

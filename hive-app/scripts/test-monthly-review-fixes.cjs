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
const { surveyCalendarWindow, eligibleSurveyEvent, surveyEventVisibilityLabel, buzzCalendarItems } = load(path.resolve('lib/buzzCalendar.ts'));
const { shouldReturnToCheckIn } = load(path.resolve('lib/boardCheckInReturn.ts'));
const { isInvitedToEvent, canShareEventDetailsOnHiveWide } = load(path.resolve('lib/eventDisplay.ts'));
const { currentMonthlyHelpPost, monthlyHelpFocusCopy, monthlyHelpWindow, quarterHelpContext } = load(path.resolve('lib/monthlyHiveHelp.ts'));
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
assert.equal(eligibleSurveyEvent(meetingDates[0], ['og'], start, '2026-10-28'), true, 'OG member sees own private meeting');
assert.equal(eligibleSurveyEvent(meetingDates[0], ['tech'], start, '2026-10-28'), false, 'Tech-only member sees no OG-private name');
assert.equal(eligibleSurveyEvent(meetingDates[1], ['og'], start, '2026-10-28'), true, 'shared Tech meeting appears beside OG');
assert.equal(eligibleSurveyEvent(meetingDates[1], ['og'], start, '2026-10-07'), false);
assert.equal(eligibleSurveyEvent(meetingDates[2], ['production'], start, '2026-10-28'), false, 'Production stays out of survey');
assert.equal(buzzCalendarItems(meetingDates.filter(meeting => eligibleSurveyEvent(meeting, ['og'], start, '2026-10-28')), []).length, 2);
const privateOgBirthday = { ...meetingDates[0], id: 'og-birthday', title: 'OG birthday', event_type: 'birthday', event_date: '2026-10-20' };
const privateTechEvent = { ...meetingDates[1], id: 'tech-hang', title: 'Tech hang', event_type: 'custom', event_date: '2026-10-24', visibility: 'members' };
assert.equal(eligibleSurveyEvent(privateOgBirthday, ['og', 'tech'], start, '2026-10-28'), true, 'canonical OG birthday appears for OG member');
assert.equal(eligibleSurveyEvent(privateOgBirthday, ['tech'], start, '2026-10-28'), false, 'OG birthday stays private');
assert.equal(eligibleSurveyEvent(privateTechEvent, ['og', 'tech'], start, '2026-10-28'), true, 'Tech member sees private Tech event');
assert.equal(eligibleSurveyEvent(privateTechEvent, ['og'], start, '2026-10-28'), false, 'OG-only member cannot see private Tech event');
assert.equal(surveyEventVisibilityLabel(meetingDates[0]), 'OG HIVE');
assert.equal(surveyEventVisibilityLabel(meetingDates[1]), 'HIVE-Wide', 'visibility label does not imply Tech invites everyone');
assert.equal(surveyEventVisibilityLabel(privateTechEvent), 'Tech HIVE');
assert.equal(isInvitedToEvent(meetingDates[0], ['og']), true, 'OG member can see own meeting time');
assert.equal(isInvitedToEvent(meetingDates[1], ['og']), false, 'Tech meeting invitation is not expanded to OG');
assert.equal(canShareEventDetailsOnHiveWide(meetingDates[1]), false, 'Tech meeting time stays private on the shared view');
const wide = { title: 'October First Friday', event_date: '2026-10-02', event_type: 'custom', visibility: 'all_hives', invited_scope: 'all_hives', community: { slug: 'default' } };
const publicEvent = { ...wide, title: 'Open art walk', visibility: 'public', invited_scope: 'public' };
assert.equal(surveyEventVisibilityLabel(publicEvent), 'Public');
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
const surveyCalendarSource = fs.readFileSync(path.resolve('components/surveys/BuzzCalendarPreview.tsx'), 'utf8');
assert.ok(surveyCalendarSource.includes('>Upcoming events:</Text>'));
assert.ok(!surveyCalendarSource.includes('Show all ') && !surveyCalendarSource.includes('rows.slice(0, 5)'), 'the full qualifying list renders without a toggle');

const helpPosts = [
  { id: 'quarter', title: 'HIVE Help — Meals for our neighbors', content: 'Quarter overview', created_at: '2026-10-01T19:00:00Z', visibility: 'all_hives' },
  { id: 'oct', title: 'October HIVE Help — collect your plastic to-go containers', content: 'Existing October thread', created_at: '2026-09-23T18:00:00Z', visibility: 'members' },
  { id: 'nov', title: 'November HIVE Help — collect food', content: 'November plan', created_at: '2026-10-01T18:00:00Z', visibility: 'all_hives' },
  { id: 'dec', title: 'December HIVE Help — cook and distribute meals', content: 'December plan', created_at: '2026-10-01T18:00:00Z', visibility: 'all_hives' },
];
assert.equal(monthlyHelpWindow('2026-10').earliest, '2026-09-01');
assert.equal(currentMonthlyHelpPost(helpPosts, events.pacificDay(at('2026-10-01T18:00:00Z')).slice(0, 7))?.id, 'oct',
  'September review opened October 1 uses October, not September or the newest quarter post');
assert.equal(currentMonthlyHelpPost(helpPosts, '2026-11')?.id, 'nov');
assert.equal(currentMonthlyHelpPost(helpPosts, '2026-12')?.id, 'dec', 'a December plan posted at quarter start becomes current only in December');
assert.equal(currentMonthlyHelpPost(helpPosts, '2027-01'), null, 'a prior quarter cannot linger as current');
assert.equal(currentMonthlyHelpPost(helpPosts.filter(post => post.id !== 'oct'), '2026-10'), null,
  'future month and quarter posts do not substitute for a missing October focus');
assert.equal(currentMonthlyHelpPost([helpPosts[1]], '2027-10'), null, 'last year’s October thread is stale');
assert.equal(currentMonthlyHelpPost([], '2026-10'), null, 'RLS-hidden private posts do not appear for other HIVEs');
const nonOgVisiblePosts = helpPosts.filter(post => post.visibility !== 'members');
assert.equal(currentMonthlyHelpPost(nonOgVisiblePosts, '2026-10'), null, 'non-OG member needs the existing October thread shared');
assert.equal(currentMonthlyHelpPost([...nonOgVisiblePosts, { ...helpPosts[1], visibility: 'all_hives' }], '2026-10')?.id, 'oct',
  'sharing only the existing October thread makes it readable without duplicating it');
assert.equal(quarterHelpContext('Right now, collect plastic to-go containers. Later, collect canned goods. Then cook and deliver meals locally.'),
  'Right now, collect plastic to-go containers. Later, collect canned goods. Then cook and deliver meals locally.',
  'the owner-written plan stays intact ahead of the bold monthly focus');
const canonicalHelpContent = 'October’s HIVE Help focus: collect your plastic to-go containers.\n\n'
  + '(Decided together at the meeting — log your helps in this thread!)\n\n'
  + 'We’re doing a three-part HIVE Help: containers in October, canned goods in November, then cooking and delivering warm meals to people experiencing homelessness in Las Vegas in December.\n\n'
  + 'If you’re in Vegas, join the group plan. Elsewhere? Do this in parallel locally. Share your wins here — we celebrate every win, no matter how small.';
const canonicalHelpCopy = monthlyHelpFocusCopy('October HIVE Help — collect your plastic to-go containers',
  canonicalHelpContent, null);
assert.deepEqual(JSON.parse(JSON.stringify(canonicalHelpCopy)), {
  heading: 'October focus: Collect your plastic to-go containers',
  introduction: 'We’re doing a three-part HIVE Help: containers in October, canned goods in November, then cooking and delivering warm meals to people experiencing homelessness in Las Vegas in December.',
  details: '(Decided together at the meeting — log your helps in this thread!)\n\nIf you’re in Vegas, join the group plan. Elsewhere? Do this in parallel locally. Share your wins here — we celebrate every win, no matter how small.',
}, 'the live October board text yields explanation, focus, then participation without the duplicate action');
assert.equal(monthlyHelpFocusCopy('November HIVE Help — collect canned goods', 'Bring cans to the next meeting.', null).details,
  'Bring cans to the next meeting.', 'a distinct future focus detail is preserved');
assert.equal(monthlyHelpFocusCopy('November HIVE Help — collect canned goods', 'Bring cans to the next meeting.', 'Quarter plan').introduction,
  'Quarter plan', 'the separate initiative post remains the fallback explanation');

const helpModule = { exports: {} };
const helpJs = ts.transpileModule(fs.readFileSync(path.resolve('components/surveys/HiveHelpPreview.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(helpJs, { module: helpModule, exports: helpModule.exports, require: name => ({
  react: { useState: initial => [initial], useEffect: () => {} },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
  '@tanstack/react-query': { useQuery: () => ({ data: {
    title: 'October HIVE Help — collect your plastic to-go containers', content: canonicalHelpContent,
    quarterContext: null, category_id: 'board-id',
  }, isLoading: false, isError: false }) },
  '../../lib/supabase': { supabase: {} },
  '../../supabase/functions/_shared/upcomingEvents': { pacificDay: () => '2026-10-02' },
  '../../lib/monthlyHiveHelp': { currentMonthlyHelpPost, monthlyHelpFocusCopy, monthlyHelpWindow, quarterHelpContext },
})[name] });
const renderedHelp = helpModule.exports.HiveHelpPreview({ onOpenBoard: () => {} });
const textInOrder = node => typeof node === 'string' ? node : Array.isArray(node)
  ? node.map(textInOrder).join(' ') : node?.props ? textInOrder(node.props.children) : '';
const helpText = textInOrder(renderedHelp);
const explanationAt = helpText.indexOf('We’re doing a three-part HIVE Help');
const focusAt = helpText.indexOf('October focus: Collect your plastic to-go containers');
const noteAt = helpText.indexOf('(Decided together at the meeting');
const localAt = helpText.indexOf('If you’re in Vegas');
const boardAt = helpText.indexOf('Share a win on HIVE Help');
assert.ok(explanationAt >= 0 && explanationAt < focusAt && focusAt < noteAt && noteAt < localAt && localAt < boardAt,
  'the rendered card follows the owner-approved explanation, focus, note, local invitation, and board link order');
assert.doesNotMatch(helpText, /neighbors/i, 'the card does not invent a different audience');
assert.equal((helpText.match(/October’s HIVE Help focus:/g) ?? []).length, 0, 'the duplicate focus sentence is hidden');

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

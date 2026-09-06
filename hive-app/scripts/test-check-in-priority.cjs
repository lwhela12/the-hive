const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/checkInPresentation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: moduleObject.exports, module: moduleObject, Date, Set });
const { pacificToday, meetingPriority, meetingLabel, groupCheckInHives } = moduleObject.exports;
const event = (community_id, event_date, event_time = '18:00', id = community_id) => ({ id, community_id, event_date, event_time });
for (const [instant, day] of [
  ['2026-09-10T06:59:59Z', '2026-09-09'], ['2026-09-10T07:00:00Z', '2026-09-10'],
  ['2026-03-08T09:59:59Z', '2026-03-08'], ['2026-03-08T10:00:00Z', '2026-03-08'],
  ['2026-11-01T08:59:59Z', '2026-11-01'], ['2026-11-01T09:00:00Z', '2026-11-01'],
  ['2027-01-01T07:59:59Z', '2026-12-31'], ['2027-01-01T08:00:00Z', '2027-01-01'],
]) assert.equal(pacificToday(new Date(instant)), day);
for (const [today, tomorrow] of [['2026-09-30','2026-10-01'], ['2026-12-31','2027-01-01'], ['2028-02-28','2028-02-29'], ['2026-03-08','2026-03-09'], ['2026-11-01','2026-11-02']]) {
  assert.equal(meetingPriority(event('a', today), today), 'today');
  assert.equal(meetingPriority(event('a', tomorrow), today), 'tomorrow');
}
const meeting = event('a', '2026-09-10');
assert.match(meetingLabel(meeting, '2026-09-09'), /^Tomorrow/);
assert.match(meetingLabel(meeting, '2026-09-10'), /^Today/, 'late email click uses actual current day');
assert.equal(meetingPriority(undefined, '2026-09-10'), 'missing');
const members = ['far','tomorrow','missing','todayLate','todayEarly'].map(community_id => ({community_id}));
const meetings = [event('far','2027-02-01'), event('tomorrow','2026-09-11'), event('todayLate','2026-09-10','20:00'), event('outsider','2026-09-10'), event('todayEarly','2026-09-10','17:00'), event('todayEarly','2026-09-10','16:00','earliest')];
const before = JSON.stringify({members,meetings});
const groups = groupCheckInHives(members, meetings, '2026-09-10');
assert.equal(groups.prominent.map(x => x.member.community_id).join(','), 'todayEarly,todayLate,tomorrow');
assert.equal(groups.prominent[0].event.id, 'earliest');
assert.equal(groups.future.map(x => x.member.community_id).join(','), 'far', 'no seven-day cutoff');
assert.equal(groups.missing.map(x => x.member.community_id).join(','), 'missing');
assert.equal(Object.values(groups).flat().length, members.length, 'every member HIVE exactly once; outsiders excluded');
assert.equal(JSON.stringify({members,meetings}), before, 'presentation never mutates source records');
assert.equal(groupCheckInHives([], meetings, '2026-09-10').prominent.length, 0);
const screen = fs.readFileSync('app/(app)/beforewemeet/index.tsx', 'utf8');
assert.match(screen, /loadedScope === scope/, 'old membership/user data hidden synchronously during rapid switches');
assert.match(screen, /if \(cancelled\) return;/, 'cancelled fetch cannot replace current scope');
assert.match(screen, /setState\('looking'\)/);
assert.match(screen, /setReview\(\{\}\)/);
assert.match(screen, /groups\.future\.map\(renderHive\)/, 'future check-ins stay visible');
assert.match(screen, /groups\.prominent\.length === 1/, 'a one-HIVE email opens the relevant form directly');
assert.doesNotMatch(screen, /Looking ahead · Optional|No meetings today or tomorrow/, 'meeting timing does not gate the form');
assert.ok(screen.indexOf('<AppHeader') < screen.indexOf('<ScrollView'), 'the header sits outside padded page content');
assert.doesNotMatch(screen, /<AppHeader[^>]+tone="wide"/, 'the header keeps the current HIVE context');
assert.match(screen, /Saved — review/);
assert.match(screen, /disabled=\{!section\}/, 'a missing meeting date does not close the check-in');
assert.match(screen, /nextMeetingOccurrence\(selected\)/, 'an undated HIVE still saves a durable next-meeting receipt');
assert.match(screen, /\.eq\('event_type', 'meeting'\)\s*\.eq\('status', 'scheduled'\)\s*\.lt\('event_date', today\)/, 'cancelled meetings do not count as a first meeting');
assert.match(screen, /selectedMembership\?\.community_id \?\? null/, 'each continued form wears its own HIVE');
assert.match(screen, /if \(!isFocused\) \{ originHandled\.current = null; return; \}/, 'returning to the same HIVE reopens its section');
assert.doesNotMatch(screen, /hiveSlug=\{memberships\.find\(m => m\.community_id === selected\)/, 'branding uses the explicitly selected membership');
assert.match(screen, /meetingOccurrence\(event.id\)/);
assert.match(screen, /draftScope=/);
assert.match(screen, /if \(plate !== undefined\) own.answers.q_plate = plate/);
const meetingsScreen = fs.readFileSync('app/(app)/meetings.tsx', 'utf8');
assert.match(meetingsScreen, /Your check-ins/);
assert.doesNotMatch(meetingsScreen, /Fill these in before the meeting/);
assert.doesNotMatch(meetingsScreen, /\{\(isAdmin \|\| !tailoredCheckIns\)/, 'regular members see the two check-in pills too');
assert.match(meetingsScreen, /params: \{ from: 'meetings', hive: community\?\.slug \?\? '' \}/, 'a HIVE pill carries its place into the shared route');
const monthScreen = fs.readFileSync('app/(app)/endofmonth/index.tsx', 'utf8');
assert.ok(monthScreen.indexOf('<AppHeader') < monthScreen.indexOf('<ScrollView'), 'month header sits outside padded page content');
assert.doesNotMatch(monthScreen, /<AppHeader[^>]+tone="wide"/, 'month header keeps the current HIVE context');
assert.match(monthScreen, /originMembership\?\.community_id \?\? survey\.community_id/, 'month sections keep their entry HIVE too');
assert.match(monthScreen, /if \(!isFocused\) \{ originHandled\.current = null; return; \}/, 'month check-in handles a same-HIVE revisit');
const homeScreen = fs.readFileSync('app/(app)/hive.tsx', 'utf8');
assert.match(homeScreen, /meetingIsTomorrow/, 'Home is a day-before nudge rather than an always-open door');
assert.match(homeScreen, /check_in_completions/, 'Home reads the exact occurrence receipt rather than any old answer');
assert.match(homeScreen, /`\$\{communityId\}:\$\{row\.survey_id\}:\$\{row\.occurrence\}`/, 'Home completion state is scoped to the visible HIVE');
assert.match(homeScreen, /pathname: '\/beforewemeet'/, 'Home uses the full Before we meet flow');
assert.match(homeScreen, /pathname: '\/endofmonth'/, 'Home uses the full End of the month flow');
const whatsNext = fs.readFileSync('lib/hooks/useWhatsNext.ts', 'utf8');
assert.match(whatsNext, /meeting\.event_date === tomorrow/, 'What’s Next uses the day-before reminder rule');
assert.match(whatsNext, /\.eq\('status', 'scheduled'\)/, 'cancelled meetings never create check-in work');
assert.match(whatsNext, /destination: isBeforeWeMeet/, 'What’s Next distinguishes the two shared check-ins');
assert.doesNotMatch(whatsNext, /holdId|openable|Send it:/, 'What’s Next has no retired approval or direct-send door');
assert.match(whatsNext, /completion\.occurrence === `meeting:\$\{meeting\.id\}`/, 'What’s Next reads the exact meeting receipt');
const checkInRules = fs.readFileSync('lib/checkIns.ts', 'utf8');
assert.match(checkInRules, /SEASON_CHECK_IN_LEAD_DAYS - 1/, 'month-end attention starts on the third-to-last calendar day');
assert.match(checkInRules, /new Date\(Number\(dateParts\[1\]\), Number\(dateParts\[2\]\) - 1, Number\(dateParts\[3\]\), 12\)/, 'date-only due dates are constructed as local calendar days');
const previousTimezone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
const localMonthEnd = new Date(2026, 8, 30, 12);
assert.equal(localMonthEnd.getDate(), 30, 'Pacific time keeps September 30 on September 30');
process.env.TZ = previousTimezone;
const settingsCopy = fs.readFileSync('lib/emailSettings.ts', 'utf8');
assert.match(settingsCopy, /The day before the meeting/, 'settings describe the same reminder timing');
assert.doesNotMatch(settingsCopy, /Three days before the meeting/);
const noMeetingMigration = fs.readFileSync('supabase/migrations/236_check_ins_stay_open_without_a_meeting.sql', 'utf8');
assert.match(noMeetingMigration, /p_occurrence = v_next_occurrence/, 'the database accepts the undated next-meeting drawer');
assert.match(noMeetingMigration, /carried-to:/, 'the undated drawer is consumed by the next scheduled meeting');

// Execute the screen with controlled hook state: no browser or backend involved.
function renderScreen({ user = 'user', loading = false, loaded = 'user:far:missing:todayEarly:todayLate:tomorrow:2026-09-10', selected = null } = {}) {
  const values = [null, false, undefined, selected, {}, meetings, {todayEarly:{answer:'saved'}}, {id:'survey'}, {sections:members.map(m=>({communityId:m.community_id,slug:m.community_id})),description:''}, {}, 'ready', '2026-09-10', loaded];
  let index = 0;
  const react = { useState: () => [values[index++], () => {}], useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {}, useRef: value => ({current:value}) };
  const jsx = (type, props) => ({type: typeof type === 'function' ? type.name : type, ...props});
  const output = {exports:{}};
  const imports = {
    react, 'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':Object.fromEntries(['ActivityIndicator','Pressable','ScrollView','Text','View'].map(n=>[n,n])),
    'expo-router':{useRouter:()=>({replace(){}}),useLocalSearchParams:()=>({})}, '@react-navigation/native':{useIsFocused:()=>true},
  };
  vm.runInNewContext(ts.transpileModule(screen, {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    exports:output.exports,module:output,require: name => imports[name] ?? (
      name.endsWith('/useAuth') ? {useAuth:()=>({loading,profile:{id:user},memberships:members})} :
      name.endsWith('/pageSkin') ? {usePageSkin:()=>({})} :
      name.endsWith('/useSurveys') ? {useSurveys:()=>({})} :
      name.endsWith('/checkInPresentation') ? moduleObject.exports :
      name.endsWith('/checkIns') ? {mergedPreMeetingQuestions:()=>[]} :
      name.endsWith('/hiveBrand') ? {hiveAccent:()=>'',hiveDisplayName:()=>''} :
      new Proxy({}, {get:(_,key)=>String(key)})
    ), Date, Set, setInterval, clearInterval,
  });
  return JSON.stringify(output.exports.default());
}
const open = renderScreen();
assert.match(open, /Upcoming meetings/);
assert.ok(!open.includes('Anytime'));
assert.ok(!open.includes('SharedPlate'), 'plate belongs inside the selected check-in, not the meeting list');
assert.match(open, /2027-02-01/, 'future cards are visible without waiting or expanding anything');
assert.match(open, /Saved — review/);
for (const options of [{user:'other'}, {loading:true}, {loaded:null}, {user:'other',selected:'todayEarly'}]) {
  const rendered = renderScreen(options);
  assert.match(rendered, /Opening Before we meet/);
  assert.ok(!rendered.includes('Saved — review'), 'rapid scope switch never shows stale answers');
  assert.ok(!rendered.includes('SurveyModal'), 'stale modal hidden before next fetch');
}
console.log('PASS: Pacific midnight/DST/year/leap boundaries, late clicks, date/time sorting, all future check-ins visible, HIVE context preserved, headers outside padded content, all member HIVEs, immutable records, rapid scope isolation, and receipt/draft/plate guards.');

// Date-only survey dates must not shift backward in Pacific time.
const modalSource = fs.readFileSync('components/surveys/SurveyModal.tsx', 'utf8');
const dateFormatter = modalSource.slice(modalSource.indexOf('function formatSurveyDueDate('), modalSource.indexOf('export function SurveyModal('));
const dateContext = { Date };
vm.runInNewContext(ts.transpileModule(dateFormatter, {}).outputText, dateContext);
const savedTimezone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
assert.equal(dateContext.formatSurveyDueDate('2026-09-08'), 'Sep 8');
assert.equal(dateContext.formatSurveyDueDate('2026-11-01'), 'Nov 1');
assert.equal(dateContext.formatSurveyDueDate('invalid'), 'invalid');
process.env.TZ = savedTimezone;
assert.equal(moduleObject.exports.meetingLabel({event_date:'2026-09-08',event_time:'18:00:00'}, '2026-09-05'), 'Tue, Sep 8 · 6:00 PM PT');
assert.ok(modalSource.indexOf('{draftLoaded && introduction}') < modalSource.indexOf('Completed work & helper credit'), 'personal question precedes context');
assert.match(screen, /linkedMeeting\?\.community_id === item.member.community_id \? linkedMeeting : item.event/, 'saved answers follow the exact linked meeting');
console.log('PASS: meeting time, date-only display across DST, personal question placement and linked receipt scope.');

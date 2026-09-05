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
assert.match(screen, /useState\(false\)/);
assert.match(screen, /lookingAhead && groups.future.map\(renderHive\)/);
assert.match(screen, /Saved — review/);
assert.match(screen, /disabled=\{!event \|\| !section\}/, 'saved check-ins remain editable');
assert.match(screen, /meetingOccurrence\(event.id\)/);
assert.match(screen, /draftScope=/);
assert.match(screen, /if \(plate !== undefined\) own.answers.q_plate = plate/);
// Execute the screen with controlled hook state: no browser or backend involved.
function renderScreen({ user = 'user', loading = false, loaded = 'user:far:missing:todayEarly:todayLate:tomorrow:2026-09-10', ahead = false, selected = null } = {}) {
  const values = [undefined, selected, {}, meetings, {todayEarly:{answer:'saved'}}, {id:'survey'}, {sections:members.map(m=>({communityId:m.community_id,slug:m.community_id})),description:''}, [], {}, 'ready', '2026-09-10', ahead, loaded];
  let index = 0;
  const react = { useState: () => [values[index++], () => {}], useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {} };
  const jsx = (type, props) => ({type: typeof type === 'function' ? type.name : type, ...props});
  const output = {exports:{}};
  const imports = {
    react, 'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':Object.fromEntries(['ActivityIndicator','Pressable','ScrollView','Text','View'].map(n=>[n,n])),
    'expo-router':{useRouter:()=>({replace(){}})}, '@react-navigation/native':{useIsFocused:()=>true},
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
const collapsed = renderScreen();
assert.match(collapsed, /Today & tomorrow/);
assert.match(collapsed, /Looking ahead/);
assert.ok(!collapsed.includes('2027-02-01'), 'future cards initially collapsed');
assert.match(renderScreen({ahead:true}), /2027-02-01/, 'future can be opened, however distant');
assert.match(collapsed, /Saved — review/);
for (const options of [{user:'other'}, {loading:true}, {loaded:null}, {user:'other',selected:'todayEarly'}]) {
  const rendered = renderScreen(options);
  assert.match(rendered, /Opening Before we meet/);
  assert.ok(!rendered.includes('Saved — review'), 'rapid scope switch never shows stale answers');
  assert.ok(!rendered.includes('SurveyModal'), 'stale modal hidden before next fetch');
}
console.log('PASS: Pacific midnight/DST/year/leap boundaries, late clicks, date/time sorting, unbounded optional future, all member HIVEs, immutable records; executed screen collapse/expand and rapid user/loading scope isolation; static receipt/draft/plate guards.');

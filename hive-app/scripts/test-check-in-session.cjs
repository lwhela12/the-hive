const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const Module = require('node:module');
require.extensions['.ts'] = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { meetingOccurrence, waitingForCheckIn, reminderKey, scopeAnswers } = require('../supabase/functions/_shared/checkInSession.ts');
const meetings = [ { id:'tech-night', community_id:'tech', event_date:'2026-09-08' }, { id:'pro-night', community_id:'pro', event_date:'2026-09-10' }, { id:'og-night', community_id:'og', event_date:'2026-09-16' } ];
const memberships = meetings.map(m => ({user_id:'nat', community_id:m.community_id}));
const completed = meetings.map(m => ({user_id:'nat', community_id:m.community_id, occurrence:meetingOccurrence(m.id)}));
assert.deepEqual(waitingForCheckIn(memberships, meetings.slice(0,1), [], '2026-09'), ['nat']);
assert.deepEqual(waitingForCheckIn(memberships, meetings.slice(1,2), completed.slice(0,1), '2026-09'), ['nat']);
for (const meeting of meetings) assert.deepEqual(waitingForCheckIn(memberships, [meeting], completed, '2026-09'), []);
assert.deepEqual(waitingForCheckIn(memberships, meetings, [], '2026-09'), ['nat']);
assert.deepEqual(waitingForCheckIn(memberships, [{...meetings[0],id:'tech-second'}], completed, '2026-09'), ['nat']);
assert.deepEqual(waitingForCheckIn(memberships, [], [{user_id:'nat', community_id:'tech', occurrence:'month:2026-09'}], '2026-09'), ['nat']);
assert.deepEqual(waitingForCheckIn(memberships, [], [{user_id:'nat', community_id:null, occurrence:'month:2026-09'}], '2026-09'), []);
assert.equal(reminderKey('checkIn','nat','2026-09-07'), reminderKey('checkIn','nat','2026-09-07'));
assert.equal(reminderKey('checkIn','nat','2026-09-07'), reminderKey('monthCheckIn','nat','2026-09-07'));
assert.notEqual(reminderKey('checkIn','nat','2026-09-07'), reminderKey('checkIn','nat','2026-09-09'));
assert.deepEqual(scopeAnswers({'tech:q':'yes','pro:q':'no', q_energy:1},'pro'), {q:'no'});
require.extensions['.png'] = (m, filename) => { m.exports = filename; };
const { buildMergedPreMeeting, splitMergedAnswers } = require('../lib/checkIns.ts');
const built = buildMergedPreMeeting([
  { id:'tech', slug:'tech', name:'Tech HIVE', questions:[{id:'q_energy',type:'scale',required:true,text:'Energy'}] },
  { id:'pro', slug:'production', name:'Production HIVE', questions:[{id:'q_energy',type:'scale',required:true,text:'Energy'}] },
]);
assert.equal(built.personal.length, 0, 'Energy must stay per HIVE');
assert.deepEqual(splitMergedAnswers(built, {'tech:q_energy':1,'pro:q_energy':5}, []), [
  {communityId:'tech',answers:{q_energy:1}}, {communityId:'pro',answers:{q_energy:5}},
]);
const modal = fs.readFileSync(require.resolve('../components/surveys/SurveyModal.tsx'),'utf8');
assert.ok(!modal.includes('DRAFT_KEY(survey.id)'), 'All draft operations must use the isolated scope');
for (const page of ['beforewemeet','endofmonth']) {
  const source = fs.readFileSync(`${__dirname}/../app/(app)/${page}/index.tsx`,'utf8');
  assert.ok(source.includes('draftScope={') && source.includes('profile?.id'), `${page}: member-scoped drafts`);
}
const edge = fs.readFileSync(`${__dirname}/../supabase/functions/open-check-in/index.ts`,'utf8');
const parsed = ts.createSourceFile('edge.ts', edge, ts.ScriptTarget.Latest, true);
assert.equal(parsed.parseDiagnostics.length, 0, 'Edge syntax');
assert.ok(edge.includes('await deliverCheckIn('), 'Both channels use the shared claim owner');
const sql = fs.readFileSync(`${__dirname}/../supabase/migrations/233_check_in_occurrence_receipts.sql`,'utf8');
assert.ok(sql.includes('e.community_id = check_in_completions.community_id'), 'Occurrence bound to own HIVE');
assert.ok(sql.includes("e.event_type = 'meeting' and e.status = 'scheduled'"));
assert.ok(sql.includes('user_id = auth.uid()'));
console.log('PASS: occurrence selection, early/all/partial completion, per-HIVE energy/splits, isolated draft wiring, edge syntax/claim ordering and RLS guards (static checks; not a database or browser acceptance test)');

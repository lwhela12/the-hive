// Read-only fixture regression: donor queries, calendar filtering, errors.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/../lib/checkInActivityContext.ts`, 'utf8');
let calls = [], fail = false;
const fixtures = [
 [{id:'help-board',name:'HIVE Helpers',status:'active',topic_kind:'helper_log'}],
 [{event_date:'2026-09-20'}],
 [{id:'ideas',title:'HIVE Help Ideas'}, {id:'focus',title:'Community garden',content:'Bring gloves'}],
 [{id:'hang',title:'Craft night',event_date:'2026-09-12'}, {id:'trip',title:'Out of town',event_date:'2026-09-13'}, {id:'away',title:'Vacation',end_date:'2026-09-15'}],
];
const client = { from(table) {
 const call = {table, filters:[]}; calls.push(call);
 const i = calls.length-1;
 const query = new Proxy({}, {get(_,method) {
  if(method==='then') return resolve => resolve({data:fixtures[i],error:fail ? Error('unavailable') : null});
  return (...args) => {call.filters.push([method,...args]); return query;};
 }}); return query;
}};
const moduleOut = {exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {
 module:moduleOut,exports:moduleOut.exports,Date,
 require:id=>id==='./supabase'?{supabase:client}:{getCycleStart:async(id)=>{assert.equal(id,'hive-a');return new Date('2026-08-21T12:00:00Z');}},
});
(async()=>{
 const data=await moduleOut.exports.fetchCheckInActivityContext('hive-a');
 assert.equal(data.help.title,'Community garden');
 assert.equal(data.help.content,'Bring gloves');
 assert.deepEqual(Array.from(data.hangs,x=>x.title),['Craft night']);
 for(const call of calls) assert.ok(call.filters.some(f=>f[0]==='eq'&&f[1]==='community_id'&&f[2]==='hive-a'));
 assert.ok(calls[2].filters.some(f=>f[0]==='is'&&f[1]==='archived_at'&&f[2]===null));
 assert.ok(calls[3].filters.some(f=>f[0]==='gte'&&f[1]==='event_date'&&f[2]==='2026-08-21'));
 assert.ok(calls[3].filters.some(f=>f[0]==='lte'&&f[2]==='2026-09-20'));
 assert.ok(calls[3].filters.some(f=>f[0]==='neq'&&f[2]==='birthday'));
 calls=[];fail=true;
 await assert.rejects(()=>moduleOut.exports.fetchCheckInActivityContext('hive-a'));
 const modal=fs.readFileSync(`${__dirname}/../components/surveys/SurveyModal.tsx`,'utf8');
 assert.ok(modal.includes('activity?.key === activityKey'));
 assert.ok(modal.includes('hangEvents={currentActivity?.data?.hangs}'));
 console.log('PASS: scoped real-row activity mapping, ideas/travel exclusions, active unarchived focus, cycle bounds, query errors, synchronous scope gate and Hangs prop wiring (mocked; no network).');
})().catch(e=>{console.error(e);process.exitCode=1;});

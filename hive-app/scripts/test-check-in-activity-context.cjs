// Read-only fixture regression: donor queries, calendar filtering, errors.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/../lib/checkInActivityContext.ts`, 'utf8');
const monthlyModule = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/monthlyHiveHelp.ts`, 'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {module:monthlyModule,exports:monthlyModule.exports,Date,Intl});
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-26T18:00:00Z'])); } }
let calls = [], fail = false;
const fixtures = [
 [{id:'help-board',name:'HIVE Helpers',status:'active',topic_kind:'helper_log'}],
 [{event_date:'2026-09-20'}],
 [{id:'dec',title:'December HIVE Help — Cook and deliver warm meals',created_at:'2026-10-01',content:''}, {id:'nov',title:'November HIVE Help — Collect canned goods',created_at:'2026-10-01',content:''}, {id:'focus',title:'October HIVE Help — collect your plastic to-go containers',created_at:'2026-09-24',content:'Bring containers'}],
 [{id:'hang',title:'Craft night',event_date:'2026-09-12'}, {id:'camp',title:'Camping trip',event_date:'2026-10-09',end_date:'2026-10-10'}, {id:'trip',title:'Out of town',event_date:'2026-09-13'}, {id:'away',title:'Vacation',event_date:'2026-09-13',end_date:'2026-09-15'}, {id:'dues',title:'OG HIVE Q3 dues due',event_date:'2026-09-30'}, {id:'end',title:'Q3 2026 ends',event_date:'2026-09-30'}, {id:'start',title:'Q4 2026 begins',event_date:'2026-10-01'}, {id:'pending',title:'Camping (Pending)',event_date:'2026-10-09'}, {id:'future',title:'Future game night',event_date:'2026-10-28'}],
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
 module:moduleOut,exports:moduleOut.exports,Date:FixedDate,
 require:id=>id==='./supabase'?{supabase:client}:id==='./monthlyHiveHelp'?monthlyModule.exports:{getCycleStart:async(id)=>{assert.equal(id,'hive-a');return new Date('2026-08-21T12:00:00Z');}},
});
(async()=>{
 const data=await moduleOut.exports.fetchCheckInActivityContext('hive-a');
 assert.equal(data.help.title,'October HIVE Help — collect your plastic to-go containers');
 assert.equal(data.help.content,'Bring containers');
 assert.deepEqual(Array.from(data.hangs,x=>x.title),['Craft night','Camping trip']);
 for(const call of calls) assert.ok(call.filters.some(f=>f[0]==='eq'&&f[1]==='community_id'&&f[2]==='hive-a'));
 assert.ok(calls[2].filters.some(f=>f[0]==='is'&&f[1]==='archived_at'&&f[2]===null));
 assert.ok(calls[3].filters.some(f=>f[0]==='gte'&&f[1]==='event_date'&&f[2]==='2026-08-21'));
 assert.ok(calls[3].filters.some(f=>f[0]==='lte'&&f[2]==='2026-09-20'));
 assert.ok(calls[3].filters.some(f=>f[0]==='neq'&&f[2]==='birthday'));
 calls=[];
 fixtures[2]=fixtures[2].filter(post=>post.id!=='focus');
 assert.equal((await moduleOut.exports.fetchCheckInActivityContext('hive-a')).help, null,
   'future month threads cannot stand in for a missing current focus');
 calls=[];fail=true;
 await assert.rejects(()=>moduleOut.exports.fetchCheckInActivityContext('hive-a'));
 const modal=fs.readFileSync(`${__dirname}/../components/surveys/SurveyModal.tsx`,'utf8');
 assert.ok(modal.includes('activity?.key === activityKey'));
 assert.ok(modal.includes('hangEvents={currentActivity?.data?.hangs}'));
 console.log('PASS: scoped real-row activity mapping, ideas/travel exclusions, active unarchived focus, cycle bounds, query errors, synchronous scope gate and Hangs prop wiring (mocked; no network).');
})().catch(e=>{console.error(e);process.exitCode=1;});

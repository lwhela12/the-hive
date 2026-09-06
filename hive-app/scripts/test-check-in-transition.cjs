const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const mod = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/checkInTransition.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod});
const {transitionAnswers}=mod.exports;
const row={id:'original',community_id:'a',response_period:'2026-09',answers:{q:7}};
assert.equal(JSON.stringify(transitionAnswers(row,'a')),JSON.stringify({q:7}));
assert.equal(transitionAnswers(row,'b'),null);
assert.equal(transitionAnswers(row,null),null);
const wide={...row,community_id:null,answers:{personal:'mine','a:q':'a','b:q':'b'}};
assert.equal(JSON.stringify(transitionAnswers(wide,'a')),JSON.stringify({q:'a'}));
assert.equal(JSON.stringify(transitionAnswers(wide,null)),JSON.stringify({personal:'mine'}));
assert.equal(transitionAnswers(wide,'c'),null);
for(const page of ['beforewemeet','endofmonth']) {
 const text=fs.readFileSync(`app/(app)/${page}/index.tsx`,'utf8');
 assert.ok(!text.includes('LegacyCheckInAnswers'));
 assert.ok(!text.includes('setReview('));
}
assert.ok(!fs.readFileSync('lib/checkInTransition.ts','utf8').includes('meetingOccurrence('));
console.log('PASS: migration231 bare per-HIVE answers, scoped shared keys, no cross-HIVE or personal leakage, retired history links, no inferred occurrence.');

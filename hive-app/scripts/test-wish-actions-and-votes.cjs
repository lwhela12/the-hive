const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]??{},Date,Map,Set,Error});return m.exports;}
const {meetingVoteResults}=load('lib/meetingVoteResults.ts');
const options=['Monday','Tuesday','Wednesday','Thursday','A weekend'];
const votes=new Map([['a',{answers:{q_meeting_day:'Tuesday'}}],['b',{answers:{q_meeting_day:'Thursday'}}],['c',{answers:{q_meeting_day:'Tuesday'}}],['d',{answers:{q_meeting_day:'Thursday'}}],['outsider',{answers:{q_meeting_day:'Monday'}}]]);
let tally=meetingVoteResults(['a','b','c','d','not-yet','a'],votes,'q_meeting_day',options);
assert.equal(tally.voted,4);assert.equal(tally.total,5);
assert.equal(tally.rows.find(r=>r.option==='Tuesday').percent,50);
assert.equal(tally.rows.find(r=>r.option==='Thursday').percent,50);
assert.equal(tally.rows.find(r=>r.option==='Monday').percent,0);
votes.set('d',{answers:{q_meeting_day:'Tuesday'}});
tally=meetingVoteResults(['a','b','c','d'],votes,'q_meeting_day',options);
assert.equal(tally.rows.find(r=>r.option==='Tuesday').percent,75,'updated answers change the tally');
assert.equal(meetingVoteResults(['absent'],votes,'q_meeting_day',options).voted,0);
assert.equal(meetingVoteResults(['a'],votes,'different_question',options).voted,0);
(async()=>{
 for(const mode of ['success','error','no-match']){
  const filters=[],writes=[];
  const q={update(v){writes.push(v);return q;},eq(k,v){filters.push([k,v]);return q;},select(){return q;},maybeSingle:async()=>({data:mode==='success'?{id:'wish'}:null,error:mode==='error'?Error('denied'):null})};
  const {archiveOwnedWish}=load('lib/wishMutations.ts',{'./supabase':{supabase:{from:()=>q}}});
  const result=await archiveOwnedWish('wish','og','owner');
  assert.equal(!!result.error,mode!=='success');
  assert.deepEqual(filters,[['id','wish'],['community_id','og'],['user_id','owner']]);
  assert.equal(writes[0].status,'replaced');assert.equal(writes[0].is_active,false);assert.equal(writes[0].is_spotlight,false);
  assert.equal(writes[0].share_scope,undefined,'archive never changes who could see the wish');
 }
 const carry=load('lib/carryForward.ts');
 assert.ok(!carry.CARRY_FORWARD_STATUS_OPTIONS.some(o=>o.value==='needs_attention'));
 const old=carry.normalizeCarryForwardResponse([{id:'wish',type:'wish',label:'Existing wish',status:'needs_attention',note:'A note already written'}])[0];
 assert.equal(old.status,'keep_active');assert.equal(old.note,'A note already written');
 const screen=fs.readFileSync('app/(app)/meeting-helper.tsx','utf8');
 assert.ok(screen.includes("['meetups', 'treasurer'].includes(deck.slides[slideIndex])"),'decision slides refresh their answers');
 assert.ok(screen.includes('meetingVoteResults(members.map'));
 console.log('PASS: day percentages, current-member denominator, duplicate/outside/unanswered exclusion, updated votes, source-HIVE owned archive, failure guards and retired flag note preservation. Offline fixtures.');
})().catch(e=>{console.error(e);process.exitCode=1;});

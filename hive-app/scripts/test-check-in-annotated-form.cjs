// Executes the annotated form's transitions with isolated dependencies. No live writes.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const jsx=(type,props)=>({type,props});
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]??{},console,Date,Map,Set});return m.exports;}
const time=load('lib/timeInput.ts');
const hard=load('lib/personalHardOut.ts',{'./timeInput':time});
const brand={HIVE_GOLD:'gold',hiveSeal:()=>1,accentPalette:()=>({line:()=>'',ink:'navy'})};
const native={Text:'Text',View:'View',Pressable:'Pressable',TextInput:'TextInput',Modal:'Modal',ScrollView:'ScrollView',useWindowDimensions:()=>({width:390})};
const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];
for(const no of ['No','Nope','none','n/a','']){assert.equal(hard.personalHardOut(no).label,null);assert.equal(hard.personalHardOutError(no),null);}
for(const [raw,label] of [['18:30','6:30 PM'],['12:00 AM','12:00 AM'],['12:00 PM','12:00 PM'],['7pm','7:00 PM']]){assert.equal(hard.personalHardOut(raw).label,label);assert.equal(hard.personalHardOutError(raw),null);}
for(const bad of [':00 PM','13:00 PM','7:60 PM','yes','around eight'])assert.ok(hard.personalHardOutError(bad));
const {HardOutInput}=load('components/surveys/HardOutInput.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'../../lib/hiveBrand':brand,'../../lib/personalHardOut':hard});
let value='Nope';const render=()=>walk(HardOutInput({value,onChange:v=>value=v}));
let nodes=render();assert.equal(nodes.filter(n=>n.type==='TextInput').length,0);
nodes.find(n=>n.props.accessibilityLabel==='Yes, I have a hard out').props.onPress();nodes=render();
assert.equal(nodes.filter(n=>n.type==='TextInput').length,2);
nodes.find(n=>n.props.accessibilityLabel==='Departure hour').props.onChangeText('7');nodes=render();
nodes.find(n=>n.props.accessibilityLabel==='Departure minute').props.onChangeText('30');
assert.equal(value,'7:30 PM');assert.equal(hard.personalHardOutError(value),null);
nodes=render();nodes.find(n=>n.props.accessibilityLabel==='No hard out').props.onPress();assert.equal(value,'No');
const carry=load('lib/carryForward.ts');
(async()=>{
for(const completed of [[],[{id:'done',text:'Finished the venue booking'}]]) for(const hiveCount of [1,2]) {
 let index=0,saves=0;
 const states=[{q_hard_out:':00 PM'},false,false,false,null,true,null,false,completed,'ready',null];
 const {SurveyModal}=load('components/surveys/SurveyModal.tsx',{
  react:{Fragment:'Fragment',useState:v=>{const i=index++;return[i in states?states[i]:v,n=>states[i]=typeof n==='function'?n(states[i]):n];},useEffect(){},useCallback:f=>f,useMemo:f=>f()},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'../../lib/hiveBrand':brand,
  '../../lib/hooks/useAuth':{useAuth:()=>({profile:null})},'../../lib/personalHardOut':hard,
  '../../lib/checkIns':{getSeasonCheckInKind:()=>null,checkInDisplayName:x=>x,isPreMeetingCheckInSurvey:()=>true,isEndOfMonthCheckInSurvey:()=>false},
  '../../lib/carryForward':carry,'./SurveyQuestionField':{SurveyQuestionField:'Question'},
 });
 const questions=[{id:'note_hive_tech',type:'note',text:'Tech HIVE'},...(hiveCount===2?[{id:'note_hive_og',type:'note',text:'OG HIVE'}]:[]),{id:'q_hard_out',type:'short',text:'Hard out'}];
 const tree=SurveyModal({survey:{id:'test',title:'Before we meet',community_id:'tech',questions},onClose(){},onSubmit:async()=>{saves++;return{error:null};}});
 const all=walk(tree),serialized=JSON.stringify(tree);
 assert.equal(serialized.includes('You got this done'),completed.length>0);
 assert.ok(!serialized.includes('roster below'));
 assert.equal(all.filter(n=>n.type==='Question'&&n.props.question.type==='note').length,hiveCount===1?0:2,'keep meaningful headings in a multi-HIVE form');
 await all.find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children??'').includes('Submit answers')).props.onPress();
 assert.equal(saves,0,'incomplete time must not save');assert.match(states[4],/hour and minute/);
}
// A task-write failure must keep the draft and offer retry after the answers save.
for (const failure of [false, true]) {
 let index=0, saves=0, removed=0;
 const task={id:'task',type:'action_item',label:'Book the venue',sourceLabel:'To-do'};
 const states=[{q_carry_forward_items:[{...task,status:'done'}]},false,false,false,null,true,null,false,[],'ready',null];
 const {SurveyModal}=load('components/surveys/SurveyModal.tsx',{
  react:{Fragment:'Fragment',useState:v=>{const i=index++;return[i in states?states[i]:v,n=>states[i]=typeof n==='function'?n(states[i]):n];},useEffect(){},useCallback:f=>f,useMemo:f=>f()},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'../../lib/hiveBrand':brand,
  '../../lib/hooks/useAuth':{useAuth:()=>({profile:{id:'member'}})},
  '../../lib/actionItemDisplay':load('lib/actionItemDisplay.ts'),
  '@react-native-async-storage/async-storage':{default:{removeItem:async()=>{removed++;},setItem:async()=>{}}},
  '../../lib/checkIns':{getSeasonCheckInKind:()=>null,checkInDisplayName:x=>x,isPreMeetingCheckInSurvey:()=>true,isEndOfMonthCheckInSurvey:()=>false},
  '../../lib/carryForward':{...carry,applyCarryForwardStatuses:async()=>({error:failure?'denied':null})},
 });
 const all=walk(SurveyModal({survey:{id:'test',title:'Before we meet',community_id:'tech',questions:[]},carryForwardItems:[task],onClose(){},onSubmit:async()=>{saves++;return{error:null};}}));
 await all.find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children??'').includes('Submit answers')).props.onPress();
 assert.equal(saves,1);assert.equal(states[2],!failure);assert.equal(removed,failure?0:1);
 if(failure)assert.match(states[4],/answers are saved.*to-do updates could not save/);
}
// Actual wish hook: an owner can grant their HIVE-Wide wish from another HIVE.
for(const owner of [true,false]) for(const fail of [false,true]) {
 const writes=[],invalidations=[];
 const client={from(table){const record={table,filters:[],payload:null};let result={data:{source_board_post_id:'post',user_id:owner?'owner':'someone-else'},error:null};const q={select(){return q;},eq(k,v){record.filters.push([k,v]);return q;},maybeSingle(){return Promise.resolve(result);},update(payload){record.payload=payload;writes.push(record);result={error:fail&&table==='wishes'?new Error('denied'):null};return q;},upsert(payload){record.payload=payload;writes.push(record);result={error:null};return q;},then(a,b){return Promise.resolve(result).then(a,b);}};return q;}};
 const {useWishes}=load('lib/hooks/useWishes.ts',{
  react:{useState:v=>[v,()=>{}],useEffect(){},useCallback:f=>f},'../supabase':{supabase:client},
  './useAuth':{useAuth:()=>({profile:{id:'owner',role:'member'},communityId:'tech',communityRole:'admin'})},
  '../queryClient':{invalidateWishQueries:async(...args)=>invalidations.push(args)},'../celebration':{celebrateWishGranted(){}},
 });
 const result=await useWishes().grantWish('wish',['helper'],'Thank you','og');
 if(!owner){assert.ok(result.error);assert.equal(writes.length,0,'being Tech admin grants no authority in OG');}
 else if(fail){assert.ok(result.error);assert.equal(writes.length,1,'failed wish update stops related writes');}
 else {
  assert.equal(result.error,null);assert.equal(writes[0].payload.status,'fulfilled');assert.equal(writes[0].payload.is_spotlight,false);
  assert.equal(writes[0].payload.share_scope,undefined,'grant never changes audience');
  assert.ok(writes[0].filters.some(([k,v])=>k==='community_id'&&v==='og'));
  assert.ok(writes[0].filters.some(([k,v])=>k==='user_id'&&v==='owner'));
  assert.equal(writes.find(w=>w.table==='wish_granters').payload[0].community_id,'og');
  assert.ok(writes.some(w=>w.table==='board_posts'),'shared linked-board completion retained');
 }
}
console.log('PASS: annotated form hides empty/redundant context; hard-out choice/clock/noon/midnight/legacy values and incomplete-save guard; cross-HIVE grant ownership, failure, helper credit, linked completion and audience preservation. Offline only.');
})().catch(e=>{console.error(e);process.exitCode=1;});

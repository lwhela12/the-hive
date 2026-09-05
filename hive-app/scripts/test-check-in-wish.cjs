// Executes the actual question component and save helper. No network or real wishes.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, mocks = {}) {
  const module = {exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module,exports:module.exports,require:name=>mocks[name]??{},console,Date,Map,Set});
  return module.exports;
}
const wish = {id:'wide',description:'My existing wish',communityId:'tech',fromHive:null,reach:'all_hives'};
let states=[false,false,true,[wish]], index=0, answers={};
const jsx=(type,props)=>({type,props});
const {SurveyQuestionField}=load('components/surveys/SurveyQuestionField.tsx',{
  react:{useState:value=>{const i=index++;if(!(i in states))states[i]=value;return[states[i],next=>states[i]=next];},useEffect(){}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},
  'expo-router':{useRouter:()=>({push(){}})},
  '../../lib/hooks/useAuth':{useAuth:()=>({profile:{id:'owner'},community:{max_share_scope:'all_hives'}})},
  '../../lib/hiveBrand':{HIVE_GOLD:'gold',accentPalette:()=>({line:()=>'',ink:'navy'})},
  '../ui/ReachPill':{ReachPill:'ReachPill'},
});
function render(){index=0;const tree=SurveyQuestionField({question:{id:'q_hd_wish',type:'long',text:'Your wish'},index:3,value:answers.q_hd_wish,answers,communityId:'tech',onChange:value=>answers.q_hd_wish=value,onSetAnswer:(key,value)=>answers[key]=value}); const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.props?.children);}walk(tree);return nodes;}
let nodes=render();
assert.equal(nodes.find(n=>n.type==='ReachPill').props.reach,'all_hives');
assert.ok(!nodes.some(n=>n.type==='ReachPill'&&n.props.onToggle),'existing wish is a visibility label, not a switch');
assert.ok(!nodes.some(n=>n.type?.name==='VoiceTextInput'),'no duplicate answer box before choosing new');
nodes.find(n=>n.props?.accessibilityLabel?.startsWith('Choose wish')).props.onPress();
assert.equal(answers.q_hd_wish_id,'wide');
nodes=render();assert.ok(nodes.some(n=>n.props?.accessibilityState?.selected));
assert.ok(!nodes.some(n=>n.type==='ReachPill'&&n.props.onToggle));
nodes.find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes('Write a new wish')).props.onPress();
nodes=render();assert.equal(answers.q_hd_wish_id,'');
assert.equal(answers.q_hd_wish_reach,'hive');
assert.ok(nodes.some(n=>n.type?.name==='VoiceTextInput'));
assert.ok(nodes.some(n=>n.type==='ReachPill'&&n.props.onToggle),'only new wish has visibility switch');
const {fileCheckInWish}=load('lib/checkInWish.ts');
function fixture(rows,error=null){const writes=[];let cleared=0;return{writes,get cleared(){return cleared;},clear:async()=>{cleared++;return{error:null};},client:{from(){let result={data:rows,error};return{select(){return this;},eq(){return this;},or(){return this;},update(payload){writes.push({kind:'update',payload});result={error:null};return this;},insert(payload){writes.push({kind:'insert',payload});result={error:null};return this;},then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};}}};}
(async()=>{
 for(const staleReach of ['hive','all_hives',undefined]){
  const f=fixture([{id:'wide',description:wish.description}]);
  await fileCheckInWish(f.client,'owner','tech',{q_hd_wish:wish.description,q_hd_wish_id:'wide',q_hd_wish_reach:staleReach},f.clear);
  assert.deepEqual(JSON.parse(JSON.stringify(f.writes)),[{kind:'update',payload:{is_spotlight:true}}],'existing audience never overwritten, even by an old draft');
 }
 const legacy=fixture([{id:'wide',description:wish.description}]);
 await fileCheckInWish(legacy.client,'owner','tech',{q_hd_wish:wish.description},legacy.clear);
 assert.equal(legacy.writes[0].kind,'update','old answer without ID reuses existing wish');
 const fresh=fixture([]);await fileCheckInWish(fresh.client,'owner','tech',{q_hd_wish:'A new wish',q_hd_wish_reach:'all_hives'},fresh.clear);
 assert.equal(fresh.writes[0].payload.share_scope,'all_hives');
 for(const f of [fixture([],new Error('read failed')),fixture([])]){
  await assert.rejects(fileCheckInWish(f.client,'owner','tech',{q_hd_wish:wish.description,q_hd_wish_id:'gone'},f.clear));
  assert.equal(f.writes.length,0);assert.equal(f.cleared,0);
 }
 console.log('PASS: actual existing/new wish UI, saved visibility label, explicit selection, stale/legacy draft audience preservation, new-wish reach, missing-wish/read-error no-write guards. Offline only.');
})().catch(e=>{console.error(e);process.exitCode=1;});

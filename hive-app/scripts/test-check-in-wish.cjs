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
const wish = {id:'wide',title:'My wish',description:'My existing wish',communityId:'og',fromHive:'OG HIVE',reach:'all_hives',record:{id:'wide',status:'public',share_scope:'all_hives',community_id:'og',user_id:'owner',description:'My existing wish'}};
const nextWish={...wish,id:'next',title:'Next wish',description:'My next focus',record:{...wish.record,id:'next',description:'My next focus'}};
let states=[false,false,true,[wish,nextWish]], index=0, answers={};
const jsx=(type,props)=>({type,props});
const {SurveyQuestionField}=load('components/surveys/SurveyQuestionField.tsx',{
  react:{useState:value=>{const i=index++;if(!(i in states))states[i]=value;return[states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useEffect(){}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},
  '../../lib/octoberOgQuestions':{isNatFeedbackQuestion:()=>false},
  'expo-router':{useRouter:()=>({push(){}})},
  '../../lib/hooks/useAuth':{useAuth:()=>({profile:{id:'owner'},community:{max_share_scope:'all_hives'}})},
  '../../lib/hiveBrand':{HIVE_GOLD:'gold',accentPalette:()=>({line:()=>'',ink:'navy'})},
  '../ui/ReachPill':{ReachPill:'ReachPill'},
  './CheckInWishGrant':{CheckInWishGrant:'Grant'},
  '../wishes/WishManageModal':{WishManageModal:'Manage'},
  '../ui/EditButton':{EditButton:'EditButton'},
  '../ui/ConfirmDialog':{ConfirmDialog:'Confirm'},
});
function render(extra={}){index=0;const tree=SurveyQuestionField({question:{id:'q_hd_wish',type:'long',text:'Your wish'},index:3,value:answers.q_hd_wish,answers,communityId:'tech',onChange:value=>answers.q_hd_wish=value,onSetAnswer:(key,value)=>answers[key]=value,...extra}); const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.props?.children);}walk(tree);return nodes;}
const review={id:'wide',type:'wish',label:'My existing wish',sourceLabel:'OG HIVE · Wish'};
const reviewProps={wishReviewItems:[review],renderWishReview:item=>jsx('WishStatus',{id:item.id})};
let nodes=render(reviewProps);
assert.ok(!nodes.some(n=>n.type==='WishStatus'||n.type==='ReachPill'||n.type?.name==='VoiceTextInput'),'only choices until a wish is selected');
nodes.find(n=>n.props?.accessibilityLabel?.startsWith('Choose wish')).props.onPress();
nodes=render(reviewProps);
assert.equal(answers.q_hd_wish_id,'wide');
assert.equal(nodes.find(n=>n.type==='ReachPill').props.reach,'all_hives');
assert.equal(nodes.filter(n=>n.type==='WishStatus').length,1);
assert.ok(nodes.some(n=>n.type==='ReachPill'&&n.props.onToggle),'owned wish uses the shared interactive reach switch');
assert.equal(nodes.filter(n=>String(n.props.accessibilityLabel??'').startsWith('Manage wish:')).length,2,'every existing wish can be managed without making it the focus');
assert.ok(!nodes.some(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes('WishStatus')));
nodes.find(n=>n.props.accessibilityLabel==='Manage wish: My wish').props.onPress();
nodes=render(reviewProps);
assert.equal(nodes.find(n=>n.type==='Manage').props.canGrant,true);
for (const action of ['onArchive','onDelete']) {
  nodes.find(n=>n.type==='Manage').props[action](wish.record);
  nodes=render(reviewProps);
  const confirmation=nodes.find(n=>n.type==='Confirm');
  assert.equal(confirmation.props.visible,true);
  assert.equal(answers.q_hd_wish_id,'wide','opening confirmation preserves focus');
  confirmation.props.onCancel();
  nodes=render(reviewProps);
  assert.equal(nodes.find(n=>n.type==='Confirm').props.visible,false);
  assert.equal(answers.q_hd_wish_id,'wide','cancel preserves selected wish');
  assert.ok(nodes.some(n=>n.props.accessibilityLabel?.startsWith('Selected wish')));
}
nodes.find(n=>n.type==='Manage').props.onGrant(wish.record);
nodes=render(reviewProps);let grant=nodes.find(n=>n.type==='Grant');
assert.equal(grant.props.wish.community_id,'og');
grant.props.onClose();assert.equal(answers.q_hd_wish_id,'wide','cancel preserves focus');
nodes=render(reviewProps);nodes.find(n=>n.props.accessibilityLabel==='Manage wish: My wish').props.onPress();
nodes=render(reviewProps);
assert.equal(nodes.find(n=>n.type==='Manage').props.canGrant,true);
nodes.find(n=>n.type==='Manage').props.onGrant(wish.record);
nodes=render(reviewProps);nodes.find(n=>n.type==='Grant').props.onGranted();
nodes=render(reviewProps);
assert.equal(answers.q_hd_wish_id,'');assert.equal(answers.q_hd_wish,'');
assert.ok(!nodes.some(n=>n.props.accessibilityLabel?.startsWith('Selected wish')));
assert.ok(answers.q_hd_granted_wish_ids.includes('wide'));
nodes.find(n=>n.props.accessibilityLabel==='Choose wish: Next wish').props.onPress();
assert.equal(answers.q_hd_wish_id,'next','a granted wish can be followed by a different focus');
nodes=render(reviewProps);
nodes.find(n=>n.props.accessibilityLabel==='Write a new wish').props.onPress();
nodes=render(reviewProps);
assert.ok(!nodes.some(n=>n.type?.name==='VoiceTextInput'),'new wish first offers own writing or Clive');
nodes.find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes('Write my own')).props.onPress();
nodes=render(reviewProps);assert.ok(nodes.some(n=>n.type?.name==='VoiceTextInput'));
assert.ok(nodes.some(n=>n.type==='ReachPill'&&n.props.onToggle));
answers.q_hd_wish='New draft';
nodes.find(n=>n.props.accessibilityLabel==='Write a new wish').props.onPress();
assert.equal(answers.q_hd_wish,'New draft','clicking selected new option preserves draft');
const carry=load('lib/carryForward.ts');
for(const grouped of [false,true]) for(const hasWish of [false,true]) {
 let state=[{q_carry_forward_items:[{...review,status:'needs_attention',note:'Please help'}]},false,false,false,null,true],cursor=0;
 const task={id:'task',type:'action_item',label:'A different task',sourceLabel:'Tech HIVE'};
 const {SurveyModal}=load('components/surveys/SurveyModal.tsx',{
  react:{Fragment:'Fragment',useState:value=>{const i=cursor++;if(!(i in state))state[i]=value;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];},useEffect(){},useCallback:fn=>fn,useMemo:fn=>fn()},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Modal:'Modal',ScrollView:'ScrollView',useWindowDimensions:()=>({width:390})},
  'expo-router':{useRouter:()=>({push(){}})},
  '../../lib/hooks/useAuth':{useAuth:()=>({profile:null})},
  '../../lib/hiveBrand':{HIVE_GOLD:'gold',hiveSeal:()=>1,accentPalette:()=>({line:()=>'',ink:'navy'})},
  '../../lib/surveyQuestionVisibility':{getVisibleSurveyQuestions:questions=>questions,pruneHiddenSurveyAnswers:(_questions,answers)=>answers},
  '../../lib/checkIns':{getSeasonCheckInKind:()=>null,checkInDisplayName:x=>x,isPreMeetingCheckInSurvey:()=>true,isEndOfMonthCheckInSurvey:()=>false},
  '@react-native-async-storage/async-storage':{default:{setItem:async()=>{}}},
  '../../lib/actionItemDisplay':load('lib/actionItemDisplay.ts'),
  '../../lib/carryForward':carry,'./SurveyQuestionField':{SurveyQuestionField:'Question'},'../ui/ComposerBar':{ComposerBar:'ComposerBar'},
 });
 const walk=n=>{if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(walk);return[n,...walk(n.props?.children)];};
 const modal=()=>{cursor=0;return SurveyModal({survey:{id:'test',title:'Before we meet',questions:[{id:'note_hive_tech',type:'note',text:'Tech HIVE'},...(hasWish?[{id:'q_hd_wish',type:'long',text:'Your wish'}]:[])],community_id:'tech'},carryForwardItems:[review,task],carryForwardSections:grouped?{note_hive_tech:[review,task]}:undefined,onClose(){},onSubmit:async()=>({error:null})});};
 let all=walk(modal());
 assert.ok(all.some(n=>n.type==='Text'&&n.props.children===task.label),'other tasks remain in roster');
 all.find(n=>n.props.accessibilityLabel==='Mark done: A different task').props.onPress();
 all=walk(modal());
 assert.ok(all.some(n=>n.props.accessibilityLabel==='Mark still to do: A different task'&&n.props.accessibilityState.checked));
 assert.ok(!all.some(n=>n.props.accessibilityLabel==='Mark done: A different task'));
 all.find(n=>n.props.accessibilityLabel==='Mark still to do: A different task').props.onPress();
 all=walk(modal());
 assert.ok(all.some(n=>n.props.accessibilityLabel==='Mark done: A different task'));
 assert.equal(state[0].q_carry_forward_items.find(i=>i.id==='task').status,'keep_active');
 assert.equal(state[0].q_carry_forward_items.find(i=>i.id===review.id).note,'Please help');

 assert.equal(all.filter(n=>n.type==='Text'&&n.props.children===review.label).length,hasWish?0:1,'move wishes only when the form has a wish question');
 if(hasWish){
  let field=all.find(n=>n.type==='Question'&&n.props.question.id==='q_hd_wish');
  assert.equal(field.props.wishReviewItems.length,1);
  let controls=walk(field.props.renderWishReview(review));
  assert.equal(controls.find(n=>n.type==='ComposerBar').props.value,'Please help','prior draft note survives relocation');
  assert.ok(!controls.some(n=>n.type==='Pressable'),'wish actions live in the shared menu, not survey status flags');
  assert.equal(carry.normalizeCarryForwardResponse(state[0].q_carry_forward_items)[0].status,'keep_active');
  assert.equal(state[0].q_carry_forward_items[0].note,'Please help');
 }
}
const {fileCheckInWish}=load('lib/checkInWish.ts');
(async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return{error:null};}};
 const noClear=async()=>{throw Error('non-atomic clear called');};
 await fileCheckInWish(client,'owner','og',{q_hd_wish:' A wish ',q_hd_wish_id:'existing',q_hd_wish_reach:'all_hives'},noClear);
 assert.equal(calls[0].name,'file_check_in_wish');
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)),{p_community_id:'og',p_description:'A wish',p_wish_id:'existing',p_reach:'all_hives'});
 await fileCheckInWish(client,'owner','og',{q_hd_wish:'New'},noClear);
 assert.equal(calls[1].args.p_wish_id,null);
 await assert.rejects(fileCheckInWish({rpc:async()=>({error:Error('removed')})},'owner','og',{q_hd_wish:'Old'},noClear));
 await assert.rejects(fileCheckInWish(client,'owner',null,{q_hd_wish:'New'},noClear));
 await fileCheckInWish(client,'owner','og',{},noClear);
 assert.equal(calls.length,2);
 console.log('PASS: wish chooser and atomic RPC save, audience and selected ID passed, server errors preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});

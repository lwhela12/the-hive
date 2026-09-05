// Isolated component regression. No browser profile, Supabase or network.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = `${__dirname}/../`;
function load(file, mocks) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(root + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, require: id => mocks[id] ?? {}, console, Date, Map, Set });
 return module.exports;
}
const jsx = (type, props) => ({ type, props });
for (const submitted of [false, true]) {
 for (const door of ['backdrop', 'X', ...(submitted ? ['completion'] : []), 'system']) {
  let states = [{}, false, submitted, false, null, true], index = 0, called = 0;
  const react = { Fragment: 'Fragment', useState: value => { const i=index++; if (!(i in states)) states[i]=value; return [states[i], next => { states[i]=next; }]; }, useEffect() {}, useCallback: fn=>fn, useMemo: fn=>fn() };
  const { SurveyModal } = load('components/surveys/SurveyModal.tsx', {
   react, 'react/jsx-runtime': { jsx, jsxs: jsx },
   'react-native': { Modal:'Modal', View:'View', Text:'Text', ScrollView:'ScrollView', Pressable:'Pressable', useWindowDimensions:()=>({width:800}) },
   '../../lib/hooks/useAuth': { useAuth:()=>({profile:null}) },
   '../../lib/hiveBrand': { HIVE_GOLD:'#bd9348', hiveSeal:()=>1, accentPalette:()=>({line:()=>'', accent:'#bd9348'}) },
   '../../lib/checkIns': { getSeasonCheckInKind:()=>null, checkInDisplayName:x=>x, isPreMeetingCheckInSurvey:()=>true, isEndOfMonthCheckInSurvey:()=>false },
   '../../lib/carryForward': { normalizeCarryForwardResponse:()=>[], CARRY_FORWARD_STATUS_OPTIONS:[] },
   '../ui/CloseButton': { CloseButton:'CloseButton' },
  });
  const render = () => { index=0; return SurveyModal({survey:{id:'test', title:'Before we meet', questions:[], community_id:null}, onClose:()=>{called++;}, onSubmit:async()=>({error:null})}); };
  let tree=render(); assert.equal(tree.props.visible,true);
  const nodes=[]; const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;} nodes.push(n);walk(n.props?.children);};walk(tree);
  if(door==='system') tree.props.onRequestClose();
  else if(door==='X') nodes.find(n=>n.type==='CloseButton').props.onPress();
  else {const buttons=nodes.filter(n=>n.type==='Pressable'); buttons[door==='backdrop'?0:buttons.length-1].props.onPress();}
  assert.equal(called,1); assert.equal(render().props.visible,false,`${door} must dismiss even when caller stays mounted`);
 }
}
for(const page of ['beforewemeet','endofmonth']) {
 const source=fs.readFileSync(root+`app/(app)/${page}/index.tsx`,'utf8');
 assert.ok(source.includes('if (!isFocused) return null;'));
 assert.ok(source.includes('onClose={() => setSelected(null)}'));
}
(async()=>{
 const {applyCarryForwardStatuses,normalizeCarryForwardResponse}=load('lib/carryForward.ts',{});
 let writes=0;
 const item={id:'task',type:'action_item',label:'A real task',status:'needs_attention',note:'Need a hand'};
 assert.equal(normalizeCarryForwardResponse([item])[0].note,'Need a hand');
 await applyCarryForwardStatuses({from(){writes++;throw Error('Unexpected write');}},'member',[item]);
 assert.equal(writes,0);
 console.log('PASS: actual SurveyModal render/handlers hide portal for backdrop/X/system and completion, even with retained caller; both staples focus-gated; Needs attention keeps note and performs zero task writes. Isolated mocked dependencies, not signed-in browser acceptance.');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Actual selectors, screen callbacks and confirmation component; isolated fixtures, no network.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const jsx=(type,props)=>({type,props});
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:id=>mocks[id]??{},Date,Set,Map,console,setInterval,clearInterval});return m.exports;}
const presentation=load('lib/checkInPresentation.ts');
const session=load('supabase/functions/_shared/checkInSession.ts');
const event=(community_id,event_date,id=community_id)=>({id,community_id,event_date,event_time:'18:00'});
const members=['tech','og','show','far','missing'].map(community_id=>({user_id:'user',community_id,community:{id:community_id,slug:community_id,name:community_id==='og'?'OG HIVE':community_id==='show'?'Production HIVE':`${community_id==='tech'?'Tech':'Far'} HIVE`,accent_color:community_id==='tech'?'#011f46':community_id==='show'?'#6b4769':'#bd9348'}}));
const meetings=[event('tech','2026-09-08'),event('og','2026-09-09'),event('show','2026-09-10'),event('far','2026-09-30'),event('outsider','2026-09-09')];
const ids=rows=>rows.map(r=>r.event.id).join(',');
assert.equal(ids(presentation.upcomingCheckIns(members,meetings,{},'tech','2026-09-07')),'og,show');
assert.equal(ids(presentation.upcomingCheckIns(members,meetings,{og:{}},'tech','2026-09-07')),'show');
assert.equal(ids(presentation.upcomingCheckIns(members,meetings,{og:{},show:{}},'tech','2026-09-07')),'');
for(const [today,last,outside] of [['2026-09-30','2026-10-06','2026-10-07'],['2026-12-30','2027-01-05','2027-01-06'],['2026-03-07','2026-03-13','2026-03-14'],['2026-10-31','2026-11-06','2026-11-07'],['2028-02-27','2028-03-04','2028-03-05']]){
 assert.equal(ids(presentation.upcomingCheckIns(members,[event('og',last),event('show',outside)],{},'tech',today)),'og');
}
assert.equal(ids(presentation.upcomingCheckIns(members,[event('og','2026-10-01')],{},'tech','2026-09-30')),'og','30th and following 1st belong together');
assert.equal(ids(presentation.upcomingCheckIns(members,[event('og','2026-09-30')],{},'tech','2026-09-01')),'','same-month 1st and 30th stay apart');
assert.equal(ids(presentation.upcomingCheckIns(members,[event('og','2026-09-07'),event('show','2026-09-06')],{},'tech','2026-09-07')),'og','today is included, past excluded');
assert.ok(presentation.groupCheckInHives(members,meetings,'2026-09-07').future.some(r=>r.member.community_id==='far'),'seven-day suggestions do not close farther meetings');
const brand={hiveDisplayName:name=>name??'HIVE',hiveAccent:c=>c?.accent_color??'#bd9348',hiveSeal:slug=>`/logos/${slug==='tech'?'tech-hive':slug==='show'?'production-hive':'og-hive'}.png`};
const {CheckInNextMeetings}=load('components/surveys/CheckInNextMeetings.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Pressable:'Pressable',Text:'Text',View:'View'},'expo-image':{Image:'Image'},'./CheckInHiveCard':{CheckInHiveCard:'CheckInHiveCard'},'../../lib/hiveBrand':brand});
let values,index=0,routes=[],receiptRows=[],saved={};
const react={useState:()=>{const i=index++;return[values[i],next=>values[i]=typeof next==='function'?next(values[i]):next];},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){},useRef:value=>({current:value})};
let routeHive='tech',browse=false;
const {default:Screen}=load('app/(app)/beforewemeet/index.tsx',{
 react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{ActivityIndicator:'Spinner',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View'},
 'expo-router':{useRouter:()=>({replace:href=>routes.push(href)}),useLocalSearchParams:()=>browse?{browse:'all'}:{meeting:routeHive}},
 '@react-navigation/native':{useIsFocused:()=>true},'../../../lib/hooks/useAuth':{useAuth:()=>({loading:false,profile:{id:'user'},communityId:routeHive,memberships:members,wholeHive:false})},
 '../../../lib/pageSkin':{usePageSkin:()=>({})},'../../../lib/hooks/useSurveys':{useSurveys:()=>({submitCheckInOccurrence:async(id,answers,community_id,occurrence)=>{receiptRows.push({user_id:'user',community_id,occurrence,answers});return{error:null};}})},
 '../../../lib/checkInPresentation':presentation,'../../../supabase/functions/_shared/checkInSession':session,'../../../lib/hiveBrand':brand,
 '../../../lib/checkIns':{mergedPreMeetingQuestions:()=>[],splitMergedAnswers:(merged,answers)=>[{communityId:routeHive,answers:{q_note:answers[`${routeHive}:q_note`]}}]},
 '../../../lib/carryForward':{CARRY_FORWARD_ANSWER_KEY:'_carry_forward'},'../../../components/surveys/SurveyModal':{SurveyModal:'SurveyModal'},'../../../components/surveys/CheckInNextMeetings':{CheckInNextMeetings:'CheckInNextMeetings'},
 '../../../components/surveys/CheckInHiveCard':{CheckInHiveCard:'CheckInHiveCard'},
});
function render(hive){routeHive=hive;const scope=`user:${members.map(m=>m.community_id).sort().join(':')}:2026-09-07${browse?'':`:${hive}`}`;values=[browse?null:meetings.find(m=>m.id===hive),false,'Shared plate answer',browse?null:hive,{},meetings,saved,{id:'survey'}, {sections:members.map(m=>({communityId:m.community_id,slug:m.community.slug,questions:[]}))},{},'ready','2026-09-07',scope];index=0;return Screen();}
function nodes(tree){const out=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}out.push(n);walk(n.props?.children);}walk(tree);return out;}
(async()=>{
 for(const [hive,expected] of [['tech','og,show'],['og','show'],['show','']]){
  let tree=render(hive);assert.equal(tree.type,'SurveyModal');assert.equal(tree.props.survey.community_id,hive);assert.equal(tree.props.hiveSlug,hive);
  assert.ok(tree.props.draftScope.endsWith(`:${hive}`));
  await tree.props.onSubmit({q_note:`Only ${hive}`,q_hd_wish_id:`wish-${hive}`}); saved=values[6];
  assert.equal(receiptRows.at(-1).occurrence,`meeting:${hive}`);assert.equal(receiptRows.at(-1).answers.q_plate,'Shared plate answer');
  tree=render(hive);let closed=0;const success=tree.props.renderSuccess(()=>closed++);
  assert.equal(ids(success.props.upcoming),expected);
  const ui=CheckInNextMeetings(success.props);const children=nodes(ui);
  const cards=children.filter(n=>n.type==='CheckInHiveCard');
  if(cards.length){cards[0].props.onPress();assert.equal(routes.at(-1),`/beforewemeet?meeting=${success.props.upcoming[0].event.id}`);}
  children.find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes('Done for now')).props.onPress();assert.equal(closed,1);
 }
 for(const meeting of meetings.filter(m=>['tech','og','show'].includes(m.id))){assert.equal(session.waitingForCheckIn(members,[meeting],receiptRows,'2026-09').length,0,'each early completion suppresses its later reminder');}
 assert.equal(session.waitingForCheckIn(members,[event('tech','2026-10-08','tech-next')],receiptRows,'2026-10').length,1,'next meeting still gets its own reminder');
 const screen=render('show');screen.props.renderSuccess(()=>{}).props.onBrowse();assert.equal(routes.at(-1),'/beforewemeet?browse=all');
 browse=true;const all=render('show');assert.notEqual(all.type,'SurveyModal');assert.ok(JSON.stringify(all).includes('2026-09-30'));
 console.log('PASS: actual save → invitation → next-HIVE callbacks, separate branding/drafts/receipts, shared plate, completed filtering, Done/browse, later reminder suppression and seven-day month/year/DST/leap boundaries. Offline fixtures.');
})().catch(e=>{console.error(e);process.exitCode=1;});

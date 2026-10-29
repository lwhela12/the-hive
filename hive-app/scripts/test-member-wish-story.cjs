const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) { const module = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, require: name => name.startsWith('./') ? load('lib/' + name.slice(2) + '.ts') : require(name) }); return module.exports; }
const { meetingFocus, compactWishSteps } = load('lib/memberWishStory.ts');
const wishes = [
 {id:'old',user_id:'me',description:'Broken ankle help',status:'fulfilled',is_active:false},
 {id:'yarn',user_id:'me',description:'Find yarn',status:'public',is_active:true},
 {id:'chosen',user_id:'me',description:'Bridal shower',status:'public',is_active:true,is_spotlight:true},
];
assert.equal(meetingFocus(wishes,'chosen','Bridal shower',true).id,'chosen');
assert.equal(meetingFocus(wishes,'old','Broken ankle help',true),null);
assert.equal(meetingFocus(wishes,'deleted','Find yarn',true),null,'never substitute an unrelated open ask');
assert.equal(meetingFocus(wishes,null,'  Bridal Shower! ',true).id,'chosen');
assert.equal(meetingFocus(wishes,null,'',true),null,'unanswered survey never falls back to all wishes');
assert.equal(meetingFocus(wishes,null,'',false).id,'chosen');
const task=(id,description,wish,assigned,completed=false)=>({id,description,related_wish_id:wish,assigned_to:assigned,completed,completed_at:completed?'2026-10-26':null});
const summary=compactWishSteps([
 task('one','Book venue (re: Nat)', 'chosen','a'),
 task('two','Book venue', 'chosen','b'),
 task('old','Ankle chores','old','a'),
 task('done','Venue research','chosen','a',true),
 task('unrelated','Get yarn','yarn','a'),
],'chosen','2026-09-23');
assert.equal(summary.next.helpers.size,2);
assert.equal(summary.completed,1);
assert.equal(compactWishSteps([],undefined,'2026-09-23').next,null);
console.log('PASS: submitted focus, removed choice, no random fallback, grouped helpers, relevant cycle progress.');

const {monthlyHelp, precedingPeriod}=load('lib/memberWishStory.ts');
assert.equal(precedingPeriod('2026-10'),'2026-09');
assert.equal(precedingPeriod('2026-01'),'2025-12');
const help=monthlyHelp([
 {id:'a',description:'Collect yarn (re: Nat)',assigned_to:'other',related_user_id:'me',completed:true,completed_at:'2026-10-02'},
 {id:'b',description:'Collect yarn (re: Nat)',assigned_to:'second',related_user_id:'me',completed:true,completed_at:'2026-10-03'},
 {id:'c',description:'Schedule filming',assigned_to:'me',related_user_id:'friend',completed:false,created_at:'2026-10-02'},
 {id:'d',description:'Old ankle help',assigned_to:'other',related_user_id:'me',completed:false,created_at:'2026-07-01'},
 {id:'e',description:'Own task',assigned_to:'me',related_user_id:'me',completed:true,completed_at:'2026-10-04'},
],'me','2026-09-23','2026-10-28T17:30:00');
assert.equal(help.received.length,1);assert.equal(help.received[0].people.size,2);
assert.equal(help.given.length,0, 'an unchecked promise is not help given');
console.log('PASS: prior month boundary, named help directions, grouped copies, pending truth, stale and self-help excluded.');

const {speakingCue, focusCues, helpByPerson}=load('lib/memberWishStory.ts');
const focusText="I'm hyper focused on the Bridal Shower! I can't wait. Also hoping to finish my memoir this 2026 year. And finish my garage.";
assert.deepEqual(Array.from(focusCues(focusText), x=>x.label), ['Bridal Shower','Finish my memoir this 2026 year','Finish my garage']);
assert.equal(speakingCue("We're doing 'Box o’ Beanies' again this year & it will be great!"), "'Box o’ Beanies'");
assert.equal(speakingCue('Do not buy yarn until we confirm the budget'), 'Do not buy yarn until we confirm the budget');
assert.equal(speakingCue('Could we find some resources? I have not done this yet.'), 'Could we find some resources');
const grouped=helpByPerson([{description:'One',completed:true,people:new Set(['a','b'])},{description:'Two',completed:false,people:new Set(['a'])}]);
assert.equal(grouped.length,2);assert.equal(grouped[0].items.length,2);assert.equal(grouped[0].items[1].completed,false);
console.log('PASS: compact source cues, separate focus topics, all actions grouped by person, status preserved.');

const { completedStoryTasks, storyCutoff } = load('lib/memberWishStory.ts');
const before = storyCutoff('2026-10-28', '5:30-8pm');
assert.equal(before, '2026-10-28T17:30:00');
const prior = {id:'prior', description:'Shared a resource', assigned_to:'me', related_user_id:'lucas', completed:true, completed_at:'2026-10-27T19:00:00Z'};
const newAsk = {id:'new', description:'Lucas needs help asking for help', assigned_to:'me', related_user_id:'lucas', completed:false, completed_at:null, created_at:'2026-10-29T01:44:56Z'};
const during = {...newAsk,id:'during',completed:true,completed_at:'2026-10-29T01:45:00Z'};
const atStart = {...prior,id:'boundary',completed_at:'2026-10-29T00:30:00Z'};
const old = {...prior,id:'old',completed_at:'2026-09-01T00:00:00Z'};
const rows = [prior,newAsk,during,atStart,old];
assert.deepEqual(Array.from(completedStoryTasks(rows,'2026-09-23',before),t=>t.id),['prior']);
assert.equal(monthlyHelp(rows,'me','2026-09-23',before).given.length,1);
assert.equal(monthlyHelp(rows,'lucas','2026-09-23',before).received.length,1);
// Each subsequent card sees the same newly fanned-out requests; none count as past help.
for (const member of ['sara','charlee','nat']) {
 const fanout = {...newAsk,id:member,assigned_to:member};
 assert.equal(monthlyHelp([fanout],member,'2026-09-23',before).given.length,0);
}
assert.equal(storyCutoff('2026-11-25','17:30:00'),'2026-11-25T17:30:00');
assert.equal(completedStoryTasks([{...prior,completed_at:'2026-11-26T01:29:59Z'}],'2026-10-28',storyCutoff('2026-11-25','17:30')).length,1);
assert.equal(completedStoryTasks([{...prior,completed_at:'2026-11-26T01:30:00Z'}],'2026-10-28',storyCutoff('2026-11-25','17:30')).length,0);
console.log('PASS: fresh group requests never become past help; prior completions retained; meeting cutoff stable across members and DST.');

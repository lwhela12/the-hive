const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) { const module = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, require: name => name === './wishDisplay' ? load('lib/wishDisplay.ts') : require(name) }); return module.exports; }
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

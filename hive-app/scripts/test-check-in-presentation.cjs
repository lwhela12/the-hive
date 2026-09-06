const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/checkInPresentation.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleObject.exports,module:moduleObject,Date,Set});
const {checkInQuestions,PLATE_QUESTION,FEELING_QUESTION,FEELING_NOTE_QUESTION,HD_FOCUS_QUESTION,meetingLabel}=moduleObject.exports;
const questions=[
  {id:'q_energy_level',type:'scale',text:'Energy'},
  {id:'q_plate',type:'choice',text:'Plate'},
  {id:'q_contact',type:'choice',text:'Contact'},
  {id:'q_attendance',type:'choice',text:'Coming?',options:["🐝 I'll be there","😢 Missing this one, I'm afraid"]},
  {id:'q_pop_progress',type:'long',text:'Progress'},
  {id:'q_pop_obstacles',type:'long',text:'Obstacle'},
  {id:'q_pop_priorities',type:'long',text:'Priority'},
  {id:'q_hive_help_recap',type:'long',text:'Help recap'},
  {id:'q_newsletter',type:'long',text:'Newsletter'},
  {id:'q_month_story',type:'long',text:'How did your month go?'},
  {id:'custom',type:'long',text:'Admin custom question'},
];
const before=JSON.stringify(questions);
const adapted=checkInQuestions(questions,true);
const meeting=checkInQuestions(questions,false);
assert.equal(JSON.stringify(questions),before,'never mutate persisted questions');
assert.equal(adapted.some(q=>['q_energy_level','q_plate','q_contact'].includes(q.id)),false);
assert.equal(adapted.some(q=>['q_pop_progress','q_pop_obstacles'].includes(q.id)),false,'preseeded roster replaces duplicate progress and obstacle boxes');
assert.equal(adapted.find(q=>q.id==='q_pop_priorities').text,'What should the room help you move forward?');
assert.equal(meeting.some(q=>q.id==='q_pop_priorities'),false,'meeting focus replaces the duplicate priorities essay');
assert.equal(meeting.filter(q=>q.id==='q_hd_wish').length,1,'every meeting gets one HD focus picker');
assert.equal(meeting.find(q=>q.id==='q_hd_wish').text,HD_FOCUS_QUESTION.text);
const missingBoth=checkInQuestions([{id:'q_attendance',type:'choice',text:'Coming?'},{id:'q_hard_out',type:'short',text:'Hard out?'},{id:'custom',type:'long',text:'Custom'}]);
assert.deepEqual(Array.from(missingBoth,q=>q.id),['q_feeling_today','q_feeling_note','q_attendance','q_hard_out','q_hd_wish','custom'],'older HIVE rows receive the shared arrivals and picker');
const alreadyHasBoth=checkInQuestions([...questions,{id:'q_hd_wish',type:'long',text:'Old HD copy'}]);
assert.equal(alreadyHasBoth.filter(q=>q.id==='q_hd_wish').length,1,'never show two HD focus pickers');
assert.equal(alreadyHasBoth.some(q=>q.id==='q_pop_priorities'),false,'HD focus wins over the old priorities essay');
const production=checkInQuestions([
  {id:'q_attendance',type:'choice',text:'Coming?'},
  {id:'q_hard_out',type:'short',text:'Hard out?'},
  {id:'q_show_progress',type:'long',text:'Retype completed jobs'},
  {id:'q_on_board',type:'long',text:'Retype board notes'},
  {id:'q_pictures',type:'long',text:'Describe files'},
  {id:'q_show_obstacles',type:'long',text:'Retype blockers'},
  {id:'q_biggest_question',type:'long',text:'Retype questions'},
],false,'show');
assert.deepEqual(Array.from(production,q=>q.id),['q_feeling_today','q_feeling_note','q_attendance','q_hard_out'],'Production uses compact arrival context plus its live jobs');
assert.equal(production.some(q=>q.id==='q_hd_wish'),false,'Production has one shared show instead of personal HD focus');
assert.equal(adapted.find(q=>q.id==='q_hive_help_recap').type,'focus','HIVE Help stays a structured rating');
assert.match(adapted.find(q=>q.id==='q_attendance').options[1],/email me the recap/);
assert.match(adapted.find(q=>q.id==='q_newsletter').text,/Buzz.*shows.*shout-out/);
assert.match(adapted.find(q=>q.id==='q_month_story').text,/so far/);
assert.equal(adapted.find(q=>q.id==='custom').text,'Admin custom question');
assert.equal([PLATE_QUESTION,...adapted].filter(q=>q.id==='q_plate').length,1);
assert.equal(meeting.filter(q=>q.id===FEELING_QUESTION.id).length,1,'Before we meet has one feeling choice');
assert.equal(meeting.filter(q=>q.id===FEELING_NOTE_QUESTION.id).length,1,'Before we meet has one optional context note');
assert.match(FEELING_QUESTION.options.join(' '),/Overwhelmed.*Under the weather.*Sad or low/);
assert.match(meetingLabel({id:'a',community_id:'a',event_date:'2026-09-10',event_time:'18:30:00'}),/Sep 10.*6:30 PM PT/);
assert.equal(meetingLabel(), 'No meeting scheduled yet');
assert.match(meetingLabel({event_date:'2026-09-10'}),/Time to be confirmed/);
const modal=fs.readFileSync('components/surveys/SurveyModal.tsx','utf8');
assert.ok(!modal.includes('q_show_progress: lines.join'),'context never writes answers, including cleared drafts');
assert.ok(!modal.includes('This cycle’s scheduled Hangs'),'no redundant Hangs preamble');
assert.ok(!modal.includes('Ionicons name="checkbox"'),'task completion uses the app-wide circular control');
assert.ok(!modal.includes('Ionicons name="square-outline"'),'open tasks use the app-wide circular control');
assert.ok(modal.includes('Add findings, photos or files →'),'Production jobs open the board thread that holds the work');
assert.ok(modal.includes(".eq('related_user_id', viewerProfile.id)"));
assert.ok(modal.includes(".eq('community_id', survey.community_id)"));
assert.ok(fs.readFileSync('app/(app)/beforewemeet/index.tsx','utf8').includes('CheckInHiveCard'));
// Month-end became one continuous HIVE-Wide form in the accepted Sep 6 release.
assert.ok(fs.readFileSync('app/(app)/endofmonth/index.tsx','utf8').includes('<EndOfMonthForm'), 'month-end keeps its continuous form');
const field=fs.readFileSync('components/surveys/SurveyQuestionField.tsx','utf8');
assert.ok(!field.includes("Anything to add? Stories, suggestions"),'hang ratings do not collect unread free text');
assert.ok(!field.includes("Anything else you'd like to share?"),'HIVE Help ratings do not collect unread free text');
const meetingHelper=fs.readFileSync('app/(app)/meeting-helper.tsx','utf8');
assert.ok(meetingHelper.includes('What got done &amp; what we found'),'Production Meeting Helper shows the live work and findings');
assert.ok(meetingHelper.includes('Open findings thread →'),'Production Meeting Helper links status back to evidence');
assert.ok(meetingHelper.includes('groupProductionJobs'),'shared Production jobs are grouped instead of repeated for each person');
assert.ok(!meetingHelper.includes("{ key: 'q_show_obstacles', label: \"What's stuck\" }"),'Production Meeting Helper does not depend on retired survey homework');
const carryForward=fs.readFileSync('lib/hooks/useCarryForwardContext.ts','utf8');
assert.ok(carryForward.includes('related_board_post_id'),'check-in tasks retain their board thread link');
const beforeWeMeet=fs.readFileSync('app/(app)/beforewemeet/index.tsx','utf8');
assert.ok(beforeWeMeet.includes('ProductionProjectOverview'),'the Production manager sees the whole operation even without an assigned job');
const scopeBadge=fs.readFileSync('components/ui/ScopeBadge.tsx','utf8');
const reachPill=fs.readFileSync('components/ui/ReachPill.tsx','utf8');
assert.ok(scopeBadge.includes('hiveTagMark(owner)'),'board and other HIVE labels use the shared tag-mark colour');
assert.ok(reachPill.includes('hiveTagMark(owner)'),'wish labels use the shared tag-mark colour');
const hiveBrand=fs.readFileSync('lib/hiveBrand.ts','utf8');
assert.ok(hiveBrand.includes("hiveOnDark('show')"),'Production labels use Curtain Violet instead of the HIVE-Wide-like dark purple');
console.log('PASS: runtime copy/IDs/input immutability, preseeded roster, one help ask, recap choice, structured ratings, circular tasks, meeting date/time and scoped context.');

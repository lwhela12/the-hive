const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/checkInPresentation.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleObject.exports,module:moduleObject,Date,Set});
const {checkInQuestions,PLATE_QUESTION,meetingLabel}=moduleObject.exports;
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
assert.equal(JSON.stringify(questions),before,'never mutate persisted questions');
assert.equal(adapted.some(q=>['q_energy_level','q_plate','q_contact'].includes(q.id)),false);
assert.equal(adapted.some(q=>['q_pop_progress','q_pop_obstacles'].includes(q.id)),false,'preseeded roster replaces duplicate progress and obstacle boxes');
assert.equal(adapted.find(q=>q.id==='q_pop_priorities').text,'What should the room help you move forward?');
assert.equal(adapted.find(q=>q.id==='q_hive_help_recap').type,'focus','HIVE Help stays a structured rating');
assert.match(adapted.find(q=>q.id==='q_attendance').options[1],/email me the recap/);
assert.match(adapted.find(q=>q.id==='q_newsletter').text,/Buzz.*shows.*shout-out/);
assert.match(adapted.find(q=>q.id==='q_month_story').text,/so far/);
assert.equal(adapted.find(q=>q.id==='custom').text,'Admin custom question');
assert.equal([PLATE_QUESTION,...adapted].filter(q=>q.id==='q_plate').length,1);
assert.match(meetingLabel({id:'a',community_id:'a',event_date:'2026-09-10',event_time:'18:30:00'}),/Sep 10.*6:30 PM PT/);
assert.equal(meetingLabel(), 'No meeting scheduled yet');
assert.match(meetingLabel({event_date:'2026-09-10'}),/Time to be confirmed/);
const modal=fs.readFileSync('components/surveys/SurveyModal.tsx','utf8');
assert.ok(!modal.includes('q_show_progress: lines.join'),'context never writes answers, including cleared drafts');
assert.ok(!modal.includes('This cycle’s scheduled Hangs'),'no redundant Hangs preamble');
assert.ok(!modal.includes('Ionicons name="checkbox"'),'task completion uses the app-wide circular control');
assert.ok(!modal.includes('Ionicons name="square-outline"'),'open tasks use the app-wide circular control');
assert.ok(modal.includes(".eq('related_user_id', viewerProfile.id)"));
assert.ok(modal.includes(".eq('community_id', survey.community_id)"));
for(const page of ['beforewemeet','endofmonth']) assert.ok(fs.readFileSync(`app/(app)/${page}/index.tsx`,'utf8').includes('CheckInHiveCard'));
const field=fs.readFileSync('components/surveys/SurveyQuestionField.tsx','utf8');
assert.ok(!field.includes("Anything to add? Stories, suggestions"),'hang ratings do not collect unread free text');
assert.ok(!field.includes("Anything else you'd like to share?"),'HIVE Help ratings do not collect unread free text');
console.log('PASS: runtime copy/IDs/input immutability, preseeded roster, one help ask, recap choice, structured ratings, circular tasks, meeting date/time and scoped context.');

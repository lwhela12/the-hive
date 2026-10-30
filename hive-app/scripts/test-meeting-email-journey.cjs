// Execute the real sender with two meeting scopes and a member of both.
// All DB, identity and mail boundaries are offline doubles.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
global.Deno={env:{get:()=>undefined}};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const mail=require('../supabase/functions/_shared/reachMail.ts');
const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
const rows={
 surveys:{id:'survey',title:'Before we meet',community_id:null,is_active:true},
 events:[{id:'opaque-tech',community_id:'tech',event_date:tomorrow,community:{name:'Tech HIVE'}},{id:'opaque-og',community_id:'og',event_date:tomorrow,community:{name:'OG HIVE'}}],
 community_memberships:[{user_id:'tech-only',community_id:'tech'},{user_id:'og-only',community_id:'og'},{user_id:'both',community_id:'tech'},{user_id:'both',community_id:'og'}],
 check_in_completions:[{user_id:'both',community_id:'tech',occurrence:'meeting:opaque-tech'}],check_in_reminder_receipts:[],
};
const admin={from(table){assert.ok(table in rows,table);return {select(){return this},eq(){return this},in(){return this},maybeSingle:async()=>({data:rows[table]}),then:fn=>Promise.resolve({data:rows[table]}).then(fn)}}};
const sent=[],notifications=[];let handler;
const base=path.resolve('supabase/functions/open-check-in');
const imported=id=>id.includes('/http/server.ts')?{serve:fn=>handler=fn}:id.startsWith('https://esm.sh')?{createClient:()=>admin}:id.endsWith('/auth.ts')?{verifySupabaseJwt:async()=>({userId:'owner'}),isAuthError:()=>false,isOwner:async()=>true}:id.endsWith('/reachMail.ts')?{...mail,templateIsApproved:async()=>true,hiveIsMeetingNow:async()=>false,sendReachEmail:async(db,user,kind,letter)=>{sent.push({user,kind,letter});return {sent:true}}}:id.endsWith('/checkInDelivery.ts')?{deliverCheckIn:async(db,users,kind,day,send,note)=>{for(const user of users){await send(user);notifications.push(note(user,true))}return {notified:users.length}}}:require(path.resolve(base,id));
new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(base,'index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(imported,{});
(async()=>{
 const response=await handler(new Request('https://offline.invalid/open-check-in',{method:'POST',body:JSON.stringify({survey_id:'survey'})}));
 assert.equal(response.status,200);assert.equal(sent.length,3);
 for(const {user,letter} of sent){
  const scope=user==='tech-only'?'tech':'og';
  assert.equal(letter.hiveId,scope);assert.equal(letter.href,`https://app.the-hive.app/beforewemeet?meeting=opaque-${scope}`);
  const scoped=await mail.scopeLetter({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{name:scope==='tech'?'Tech HIVE':'OG HIVE',slug:scope==='tech'?'tech':'default'}})})},letter);
  const html=mail.reachEmailHtml({...scoped,toName:'Reader'});
  assert.match(html,scope==='tech'?/tech-hive.png/:/og-hive.png/);
  assert.doesNotMatch(html,scope==='tech'?/OG HIVE|og-hive.png/:/Tech HIVE|tech-hive.png/);
  assert.doesNotMatch(html,/covers every HIVE|hive-wide.png/);
  assert.match(html,/target="_top"/);
 }
 assert.equal(notifications.find(n=>n.user_id==='both').metadata.meeting_id,'opaque-og');
 console.log('PASS: real reminder handler binds each recipient to an unanswered own-HIVE meeting; completed Tech routes a multi-HIVE member to OG; real HTML contains only source identity and an opaque CTA. Offline only.');
})().catch(error=>{console.error(error);process.exitCode=1});

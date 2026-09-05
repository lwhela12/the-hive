const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
require.extensions['.ts'] = (m, file) => m._compile(compile(fs.readFileSync(file, 'utf8')), file);
const { deliverCheckIn } = require('../supabase/functions/_shared/checkInDelivery.ts');
function database(options = {}) {
  const claims = new Map(), notifications = [];
  return { claims, notifications, from(table) { return {
    async insert(row) {
      if (table === 'notifications') { if (options.notifyFail) return { error: {message:'notification unavailable'} }; notifications.push(row); return {}; }
      if (options.claimThrow) throw Error('claim connection lost');
      if (options.claimFail) return {error:{code:'08006',message:'database unavailable'}};
      if (claims.has(row.dedupe_key)) return { error: {code:'23505',message:'unique claim'} };
      claims.set(row.dedupe_key, row); return {};
    },
    update(value) { return { async eq(_, key) {
      if (options.receiptFail) return {error:{message:'receipt unavailable'}};
      Object.assign(claims.get(key), value); return {};
    } }; },
  }; } };
}
const note = (user, emailed) => ({user_id:user,email_sent:emailed,metadata:{survey:'shared'}});
(async () => {
  let db = database(), calls = 0;
  const send = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return {sent:true}; };
  const run = () => deliverCheckIn(db, ['member','member'], 'checkIn','2026-09-07',send,note);
  const raced = await Promise.all([run(),run()]);
  assert.equal(calls,1); assert.equal(db.notifications.length,1);
  assert.equal(raced.reduce((n,r)=>n+r.claimed,0),1);
  assert.equal(raced.reduce((n,r)=>n+r.claim_lost,0),1);
  assert.equal(db.notifications[0].email_sent,true);
  assert.equal((await run()).claimed,0);
  for (const options of [{claimFail:true},{claimThrow:true}]) {
    db=database(options); calls=0;
    const result=await run(); assert.equal(result.claim_failed,1); assert.equal(calls,0); assert.equal(db.notifications.length,0);
  }
  for (const reason of ['provider refused','no RESEND_API_KEY','threw','switched off, or no address','that HIVE is meeting']) {
    db=database();
    const result=await deliverCheckIn(db,['member'],'checkIn','2026-09-07',async()=>({sent:false,reason}),note);
    assert.equal([...db.claims.values()][0].reason,reason);
    assert.equal(result.notified,1); assert.equal(result.emailed,0);
    assert.equal(result.suppressed, /switched off|HIVE is meeting/.test(reason)?1:0);
    assert.equal(db.notifications[0].email_sent,false);
  }
  db=database();
  const thrown=await deliverCheckIn(db,['member'],'checkIn','2026-09-07',async()=>{throw Error('socket reset');},note);
  assert.equal(thrown.delivery_failed,1); assert.match([...db.claims.values()][0].reason,/socket reset/);
  assert.equal((await deliverCheckIn(db,['member'],'checkIn','2026-09-07',send,note)).claimed,0);
  db=database({notifyFail:true,receiptFail:true});
  const partial=await run(); assert.equal(partial.emailed,1); assert.equal(partial.notified,0); assert.equal(partial.notification_failed,1); assert.equal(partial.receipt_failed,1);

  // Execute the actual retired handler, with no network or live DB access.
  let handler, seals=0, queries=0;
  const chain = table => {
    queries++;
    const q={ select(){return q}, eq(){return q}, then(resolve){ resolve({data:table==='events'?[{community_id:'tech'}]:[]}); } }; return q;
  };
  const source=fs.readFileSync(`${__dirname}/../supabase/functions/check-in-reminder/index.ts`,'utf8');
  vm.runInNewContext(compile(source), {
    exports:{}, console, Date, Set,
    Deno:{env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'test-service':'https://test.invalid'}},
    fetch:async url=>{ assert.match(url,/\/seal-meeting$/); seals++; return {status:200}; },
    require: name => name.includes('http/server') ? {serve:fn=>handler=fn}
      : name.includes('supabase-js') ? {createClient:()=>({from:chain})}
      : name.includes('/auth') ? {verifySupabaseJwt:async()=>({userId:'owner'}),isAuthError:()=>false,isOwner:async()=>true}
      : name.includes('/cors') ? {handleCors:()=>null,jsonResponse:(body,status=200)=>({body,status}),errorResponse:(error,status)=>({body:{error},status})}
      : {},
  });
  for (const body of [{approve_notification_id:'stale'}, {resend_survey_id:'legacy'}, {force_send:true}, {test_email:'test@example.invalid',test_kind:'quarterly'}, {test_kind:'endofyear'}, {test_kind:'endofmonth'}, {}]) {
    const result=await handler({json:async()=>body,headers:{get:()=> 'Bearer owner'}});
    assert.equal(result.status,410); assert.equal(result.body.emails_sent,0); assert.equal(result.body.canonical_sender,'open-check-in');
  }
  assert.equal(queries,0); assert.equal(seals,0);
  const cron=await handler({json:async()=>({}),headers:{get:()=> 'Bearer test-service'}});
  assert.equal(cron.status,410); assert.equal(seals,1,'maintenance still seals yesterday');
  console.log('PASS: concurrent/repeated claims own both channels; duplicate members; claim errors/throws fail closed; failure reasons persisted; suppression separated; partial-channel reporting; all retired legacy modes send nothing; cron sealing preserved (mocked DB/network).');
})().catch(error=>{console.error(error);process.exitCode=1;});

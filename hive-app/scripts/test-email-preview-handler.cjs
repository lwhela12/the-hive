// Execute real handler with offline DB/mail doubles; never touches live data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
global.Deno = { env: { get: () => 'offline-fixture' } };
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
let handler, owner = true, approvals = [], error = null;
const deliveries = [];
global.fetch = async (url, opts) => { assert.equal(url, 'https://api.resend.com/emails'); deliveries.push(JSON.parse(opts.body)); return { ok: true }; };
const admin = { from(table) {
 assert.ok(['profiles','email_template_approvals','communities','community_memberships','events'].includes(table));
 const result = () => ({ data: table === 'profiles' ? { name: 'Owner', email: 'owner@example.invalid' } : table === 'communities' ? { name: 'Production HIVE', slug: 'show', accent_color: '#1f0338' } : table === 'community_memberships' ? [{community_id:'fixture-scope'}] : table === 'events' ? [{id:'opaque-meeting',community_id:'fixture-scope',event_date:'2099-09-08'}] : approvals, error: table === 'email_template_approvals' ? error : null });
 return { in() {return this;}, gte() {return this;}, order() {return this;}, limit() {return this;}, select() { return this; }, eq(k,v) { if(table === 'profiles') assert.equal(v, 'owner-id'); return this; }, maybeSingle: async () => result(), then: resolve => Promise.resolve(result()).then(resolve) };
} };
const base = path.resolve('supabase/functions/email-preview');
const imported = id => id.includes('/http/server.ts') ? { serve: f => handler = f } : id.startsWith('https://esm.sh') ? { createClient: () => admin } : id.endsWith('/auth.ts') ? { verifySupabaseJwt: async () => ({ userId: 'owner-id' }), isAuthError: () => false, isOwner: async () => owner } : require(path.resolve(base,id));
new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(base,'index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(imported,{});
const request = method => new Request('https://offline.invalid/email-preview?hive=fixture-scope', { method, ...(method === 'POST' ? { body: JSON.stringify({ send:true,to:'attacker@example.invalid' }) } : {}) });
(async()=>{
 const templates = (await (await handler(request('GET'))).json()).templates;
 approvals = templates.map((t,i)=>({template_key:t.key,revision:t.revision,approved:i<3}));
 let r = await (await handler(request('POST'))).json();
 assert.deepEqual(r.results.map(t=>t.key),['checkIn','monthCheckIn']); assert.equal(r.of,2);
 for(const d of deliveries) {assert.equal(d.to,'owner@example.invalid');assert.match(d.subject,/^\[Test\]/);if(d.subject.includes('meeting tomorrow')) {assert.match(d.html,/production-hive.png/);assert.match(d.html,/beforewemeet\?meeting=opaque-meeting/);assert.doesNotMatch(d.html,/covers every HIVE|hive=fixture-scope/);} else assert.doesNotMatch(d.html,/production-hive.png/);}
 approvals.forEach(t=>t.approved=true); deliveries.length=0;
 r=await (await handler(request('POST'))).json(); assert.equal(r.of,0);assert.equal(deliveries.length,0);
 approvals[0].revision='stale';
 r=await (await handler(request('POST'))).json();assert.deepEqual(r.results.map(t=>t.key),['message']);
 approvals=[];deliveries.length=0;
 r=await (await handler(request('POST'))).json();assert.equal(r.of,5);
 deliveries.length=0;error={message:'offline'};
 assert.equal((await handler(request('POST'))).status,503);assert.equal(deliveries.length,0);
 error=null;owner=false;assert.equal((await handler(request('POST'))).status,403);assert.equal(deliveries.length,0);
 console.log('PASS: 3 approved/2 pending exact selection, all-approved zero, stale/missing pending, failed lookup closed, nonowner rejected, owner-only target and scope preserved. Offline only.');
})().catch(e=>{console.error(e);process.exitCode=1;});

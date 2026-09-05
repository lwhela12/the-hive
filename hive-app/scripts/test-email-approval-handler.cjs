// Offline execution of the real HTTP handler: no Supabase or mail calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
global.Deno = { env: { get: () => undefined } };
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const mail = require('../supabase/functions/_shared/reachMail.ts');
const base = path.resolve('supabase/functions/open-check-in');
let handler, title, approval, owner = true;
const reads = [];
const admin = { from(table) {
  reads.push(table);
  assert.ok(['surveys', 'email_template_approvals'].includes(table), `Unexpected side-effect/recipient query: ${table}`);
  return { select() { return this; }, eq() { return this; }, async maybeSingle() {
    if (table === 'surveys') return { data: { id: 'fixture', title, is_active: true, community_id: null } };
    if (approval === 'throws') throw new Error('offline');
    if (approval === 'error') return { data: null, error: { message: 'missing table' } };
    return { data: approval, error: null };
  } };
} };
const imported = id => {
  if (id.includes('/http/server.ts')) return { serve: fn => { handler = fn; } };
  if (id.startsWith('https://esm.sh/')) return { createClient: () => admin };
  if (id.endsWith('/auth.ts')) return { verifySupabaseJwt: async () => ({ userId: 'owner' }), isAuthError: () => false, isOwner: async () => owner };
  return require(path.resolve(base, id));
};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path.join(base, 'index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(imported, {});
(async () => {
  let cases = 0;
  for (const [kind, name] of [['checkIn','Before we meet'], ['monthCheckIn','End of the month']]) {
    title = name;
    const revision = await mail.templateRevision(kind);
    for (approval of [null, { approved: false, revision }, { approved: true, revision: 'stale' }, 'error', 'throws']) {
      for (const dry_run of [true, false]) {
        reads.length = 0;
        const res = await handler(new Request('https://offline.invalid/open-check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ survey_id: 'fixture', dry_run }) }));
        assert.equal(res.status, 409);
        assert.deepEqual(reads, ['surveys', 'email_template_approvals']);
        cases++;
      }
    }
  }
  owner = false; reads.length = 0;
  assert.equal((await handler(new Request('https://offline.invalid', { method: 'POST', body: JSON.stringify({ survey_id: 'fixture' }) }))).status, 403);
  assert.deepEqual(reads, []);
  console.log(`PASS: ${cases} real-handler approval refusals before recipient reads/claims/notifications; non-owner refused before data access. No network.`);
})().catch(e => { console.error(e); process.exitCode = 1; });

// The real sender handler with offline rows: a paused HIVE never becomes a
// month-end recipient or appears in a member letter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
global.Deno = { env: { get: () => undefined } };
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const mail = require('../supabase/functions/_shared/reachMail.ts');
const { monthEndReviewPeriod } = require('../supabase/functions/_shared/checkInSession.ts');
const rows = {
  surveys: { id: 'month', title: 'End of the month', is_active: true, community_id: null },
  communities: [
    { id: 'og', slug: 'default', name: 'OG HIVE' },
    { id: 'tech', slug: 'tech', name: 'Tech HIVE' },
    { id: 'sealed', slug: 'show', name: 'Production HIVE' },
  ],
  community_memberships: [
    { user_id: 'og-only', community_id: 'og' },
    { user_id: 'tech-only', community_id: 'tech' },
    { user_id: 'both', community_id: 'og' },
    { user_id: 'both', community_id: 'tech' },
    { user_id: 'sealed-only', community_id: 'sealed' },
  ],
  check_in_completions: [{ survey_id: 'month', user_id: 'tech-only', community_id: null,
    occurrence: 'month:' + monthEndReviewPeriod(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })) }],
  check_in_reminder_receipts: [],
};
const reads = []; let scopeError = false;
const admin = { from(table) {
  assert.ok(table in rows, 'unexpected table: ' + table);
  const filters = [];
  const query = {
    select() { return query; },
    eq(key, value) { filters.push(row => row[key] === value); return query; },
    in(key, values) { filters.push(row => values.includes(row[key])); return query; },
    maybeSingle: async () => ({ data: rows[table], error: null }),
    then(resolve) {
      reads.push({ table, filters: filters.length });
      const data = Array.isArray(rows[table]) ? rows[table].filter(row => filters.every(test => test(row))) : rows[table];
      return Promise.resolve({ data, error: table === 'communities' && scopeError ? { message: 'offline' } : null }).then(resolve);
    },
  };
  return query;
} };
const sent = []; const notes = []; let handler; let actor = 'owner'; let ownerAllowed = true;
const base = path.resolve('supabase/functions/open-check-in');
const imported = id => id.includes('/http/server.ts') ? { serve: fn => { handler = fn; } }
  : id.startsWith('https://esm.sh') ? { createClient: () => admin }
  : id.endsWith('/auth.ts') ? { verifySupabaseJwt: async () => ({ userId: actor }), isAuthError: () => false, isOwner: async () => ownerAllowed }
  : id.endsWith('/reachMail.ts') ? { ...mail, templateIsApproved: async () => true, hiveIsMeetingNow: async () => false,
    sendReachEmail: async (_db, user, kind, letter) => { sent.push({ user, kind, letter }); return { sent: true }; } }
  : id.endsWith('/checkInDelivery.ts') ? { deliverCheckIn: async (_db, users, _kind, _day, send, note) => {
    for (const user of users) { await send(user); notes.push(note(user, true)); }
    return { notified: users.length };
  } }
  : require(path.resolve(base, id));
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path.join(base, 'index.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(imported, {});
const request = (dryRun, selfOnly = false) => new Request('https://offline.invalid/open-check-in', {
  method: 'POST', body: JSON.stringify({ survey_id: 'month', dry_run: dryRun, self_only: selfOnly }),
});
(async () => {
  const preview = await handler(request(true));
  assert.equal(preview.status, 200);
  const counts = await preview.json();
  assert.deepEqual([counts.members, counts.answered, counts.would_reach], [3, 1, 2]);
  assert.equal(counts.hive, 'active HIVEs');
  assert.equal(sent.length, 0, 'dry run never sends');
  assert.ok(reads.some(read => read.table === 'communities' && read.filters === 1), 'scope resolves by active slugs');
  const result = await handler(request(false));
  assert.equal(result.status, 200);
  assert.deepEqual(sent.map(row => row.user).sort(), ['both', 'og-only']);
  assert.deepEqual(notes.map(row => row.user_id).sort(), ['both', 'og-only']);
  for (const { kind, letter } of sent) {
    assert.equal(kind, 'monthCheckIn');
    assert.equal(letter.buttonLabel, 'Open the check-in');
    assert.ok(letter.href.endsWith('/endofmonth'));
    assert.doesNotMatch(JSON.stringify(letter), /Production HIVE|sealed/);
  }
  sent.length = 0; notes.length = 0; actor = 'og-only';
  const selfPreview = await (await handler(request(true, true))).json();
  assert.deepEqual([selfPreview.mode, selfPreview.members, selfPreview.would_reach], ['self_only', 1, 1]);
  assert.equal(sent.length, 0);
  const selfResult = await (await handler(request(false, true))).json();
  assert.equal(selfResult.mode, 'self_only');
  assert.deepEqual(sent.map(row => row.user), ['og-only'], 'self-only never contacts another member');
  assert.deepEqual(notes.map(row => row.user_id), ['og-only']);
  sent.length = 0; notes.length = 0; actor = 'tech-only';
  const answeredSelfPreview = await (await handler(request(true, true))).json();
  assert.deepEqual([answeredSelfPreview.members, answeredSelfPreview.answered, answeredSelfPreview.would_reach], [1, 1, 1],
    'an owner may receive their own real letter to revisit an existing answer');
  await handler(request(false, true));
  assert.deepEqual(sent.map(row => row.user), ['tech-only']);
  sent.length = 0; notes.length = 0; actor = 'sealed-only';
  const pausedPreview = await (await handler(request(true, true))).json();
  assert.deepEqual([pausedPreview.members, pausedPreview.would_reach], [0, 0]);
  assert.equal((await handler(request(false, true))).status, 200);
  assert.equal(sent.length, 0, 'paused-only owner cannot self-send this check-in');
  actor = 'og-only'; ownerAllowed = false;
  assert.equal((await handler(request(false, true))).status, 403, 'self-only keeps owner authorization');
  assert.equal(sent.length, 0);
  ownerAllowed = true;
  scopeError = true; sent.length = 0; notes.length = 0;
  assert.equal((await handler(request(false))).status, 503, 'scope lookup failure refuses all delivery');
  assert.equal(sent.length, 0);
  console.log('PASS: month sender excludes paused-only members, dedupes active members, skips answered, self-only reaches owner alone, keeps one CTA, and fails closed. Offline.');
})().catch(error => { console.error(error); process.exitCode = 1; });

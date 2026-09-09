const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

let handler;
const previews = [];
const inserts = [];
const event = { id: 'tech-meeting', event_date: '2026-09-09', community_id: 'tech', community: { name: 'Tech HIVE' } };

function chain(table) {
  const api = {
    select() { return api; }, eq() { return api; }, ilike() { return api; }, is() { return api; }, in() { return api; },
    maybeSingle: async () => {
      if (table === 'profiles') return { data: { id: 'nat', email: 'natwalstead@gmail.com' } };
      if (table === 'notifications') return { data: null };
      return { data: null };
    },
    single: async () => ({ data: { id: 'hold-1' }, error: null }),
    insert(row) { inserts.push({ table, row }); return api; },
    then(resolve) {
      const data = table === 'surveys' ? [{ id: 'before', title: 'Before we meet' }, { id: 'end', title: 'End of the month' }]
        : table === 'events' ? [event]
        : table === 'community_memberships' ? [{ user_id: 'waiting', community_id: 'tech' }, { user_id: 'already-done', community_id: 'tech' }]
        : table === 'check_in_completions' ? []
        : table === 'survey_responses' ? [{ user_id: 'already-done', community_id: 'tech', response_period: '2026-09' }]
        : table === 'profiles' ? [{ id: 'waiting', name: 'Brietta' }]
        : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return api;
}

const base = path.resolve('supabase/functions/check-in-preview');
function imported(id) {
  if (id.includes('/http/server.ts')) return { serve: fn => { handler = fn; } };
  if (id.startsWith('https://esm.sh')) return { createClient: () => ({ from: chain }) };
  if (id.endsWith('/cors.ts')) return { handleCors: () => null, jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }), errorResponse: (error, status = 400) => new Response(JSON.stringify({ error }), { status }) };
  if (id.endsWith('/auth.ts')) return { verifySupabaseJwt: async () => ({ userId: 'nat' }), isAuthError: () => false, isOwner: async () => true };
  if (id.endsWith('/checkInSession.ts')) return { meetingOccurrence: id => `meeting:${id}` };
  if (id.endsWith('/checkInPatterns.ts')) return { PRE_MEETING_CHECK_IN_PATTERN: /before\s+we\s+meet/i };
  if (id.endsWith('/checkInDelivery.ts')) return { deliverCheckIn: async () => ({ emailed: 0, suppressed: 0, delivery_failed: 0 }) };
  if (id.endsWith('/reachMail.ts')) return { templateIsApproved: async () => true, hiveIsMeetingNow: async () => false, genericLetter: () => ({}), sendReachEmail: async () => ({ sent: false }) };
  throw new Error(`Unexpected import ${id}`);
}

global.Deno = { env: { get: key => ({ SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_URL: 'https://db.invalid', RESEND_API_KEY: 'resend-key', FROM_EMAIL: 'HIVE <hive@example.test>', EXPO_PUBLIC_APP_URL: 'https://app.test' })[key] || '' } };
global.fetch = async (url, options) => { previews.push({ url, body: JSON.parse(options.body) }); return new Response('{}', { status: 200 }); };
const source = fs.readFileSync(path.join(base, 'index.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'exports', output)((id) => imported(id), {});

(async () => {
  const response = await handler(new Request('https://offline.invalid/check-in-preview', { method: 'POST', headers: { Authorization: 'Bearer service-key' }, body: '{}' }));
  assert.equal(response.status, 200);
  assert.equal(previews.length, 1, 'only Nat receives the scheduled preview');
  assert.equal(previews[0].body.to, 'natwalstead@gmail.com');
  assert.match(previews[0].body.html, /Brietta/);
  assert.doesNotMatch(previews[0].body.html, /already-done/, 'a saved answer is never re-reminded merely because its receipt is missing');
  assert.match(previews[0].body.html, /Yes, send it to 1/);
  assert.match(previews[0].body.html, /approve-check-in\/hold-1\?action=send/);
  assert.equal(inserts.length, 1, 'the hold is saved before the preview is emailed');
  assert.equal(inserts[0].row.metadata.check_in_approval, 'pending');
  console.log('check-in preview scheduler test passed');
})().catch(error => { console.error(error); process.exit(1); });

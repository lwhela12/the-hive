const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

let handler;
const sent = [];
const admin = { from(table) {
  const filters = {};
  const query = {
    select() { return query; },
    eq(column, value) { filters[column] = value; return query; },
    maybeSingle: async () => ({ data: table === 'profiles'
      ? { name: 'Brittany Rucci' }
      : table === 'communities' ? { name: 'OG HIVE', slug: 'default', accent_color: '#bd9348' }
      : table === 'board_replies' ? { post_id: 'parent-post' }
      : null }),
    then(resolve) { return Promise.resolve({ data: table === 'profiles'
      ? [{ id: 'nat', name: 'Nat', email: 'nat@example.test', is_owner: true }]
      : table === 'community_memberships' ? [] : [] }).then(resolve); },
  };
  return query;
} };

global.Deno = { env: { get: key => ({ SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_URL: 'https://db.invalid', RESEND_API_KEY: 'resend-key', FROM_EMAIL: 'HIVE <hive@example.test>' })[key] ?? '' } };
global.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return new Response('{}', { status: 200 }); };

const base = path.resolve('supabase/functions/notify-admin-activity');
function imported(id) {
  if (id.includes('/http/server.ts')) return { serve: fn => { handler = fn; } };
  if (id.startsWith('https://esm.sh')) return { createClient: () => admin };
  if (id.endsWith('/cors.ts')) return { handleCors: () => null, jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }), errorResponse: (error, status = 400) => new Response(JSON.stringify({ error }), { status }) };
  if (id.endsWith('/hiveMark.ts')) return { hiveMark: () => ({ accent: '#bd9348' }), hiveSealImg: () => '' };
  if (id.endsWith('/reachMail.ts')) return {
    escapeHtml: value => value.replaceAll('&', '&amp;'),
    plainTextFrom: value => value.replace(/<[^>]+>/g, ''),
    deepLink: (route, hive) => `https://app.test${route}${route.includes('?') ? '&' : '?'}hive=${hive}`,
    hiveIsMeetingNow: async () => false,
  };
  throw new Error(`Unexpected import ${id}`);
}
const source = fs.readFileSync(path.join(base, 'index.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'exports', output)(imported, {});

(async () => {
  for (const [kind, recordId, postId] of [
    ['board_post', 'new-post', 'new-post'],
    ['board_reply', 'new-reply', 'parent-post'],
  ]) {
    const response = await handler(new Request('https://db.invalid/notify-admin-activity', {
      method: 'POST', headers: { Authorization: 'Bearer service-key' },
      body: JSON.stringify({ kind, community_id: 'og-hive', actor_id: 'brittany', record_id: recordId }),
    }));
    assert.equal(response.status, 200);
    const html = sent.at(-1).html;
    assert.match(html, new RegExp(`board\\?postId=${postId}&amp;hive=og-hive`));
    assert.match(html, /Open the post/);
  }
  assert.equal(sent.length, 2);
  console.log('Activity email board links open the exact post; reply links open their parent post.');
})().catch(error => { console.error(error); process.exitCode = 1; });

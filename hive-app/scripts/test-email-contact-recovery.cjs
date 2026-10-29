const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const state = {
  memberId: 'existing-sara-id',
  profileEmail: 'sara@hotmail.test',
  authEmail: 'sara@gmail.test',
  challenge: null,
  sent: [],
  authUpdates: [],
  linkGenerations: 0,
};
const handlers = {};

function challengeQuery() {
  let operation = 'read';
  let change = null;
  const conditions = {};
  const query = {
    select() { return query; },
    eq(column, value) { conditions[column] = value; return query; },
    gt(column, value) { conditions[`gt:${column}`] = value; return query; },
    update(value) { operation = 'update'; change = value; return query; },
    delete() { operation = 'delete'; return query; },
    upsert(value) { state.challenge = value; return Promise.resolve({ error: null }); },
    maybeSingle: async () => {
      if (operation === 'read') return { data: state.challenge, error: null };
      const current = state.challenge;
      const matches = current && current.user_id === conditions.user_id
        && (!conditions.email || current.email === conditions.email)
        && (conditions.attempts === undefined || current.attempts === conditions.attempts)
        && (!conditions['gt:expires_at'] || current.expires_at > conditions['gt:expires_at']);
      if (!matches) return { data: null, error: null };
      if (operation === 'update') Object.assign(current, change);
      return { data: { user_id: current.user_id }, error: null };
    },
    then(resolve) {
      if (operation === 'delete') state.challenge = null;
      return Promise.resolve({ error: null }).then(resolve);
    },
  };
  return query;
}

const admin = {
  from(table) {
    if (table === 'profiles') return {
      select: () => ({ ilike: (_field, email) => ({
        maybeSingle: async () => ({
          data: email === state.profileEmail ? { id: state.memberId } : null, error: null,
        }),
      }) }),
    };
    if (table === 'email_link_challenges') return challengeQuery();
    throw new Error(`Unexpected table ${table}`);
  },
  rpc: async (name) => {
    assert.equal(name, 'reserve_email_login_send');
    return { data: true, error: null };
  },
  auth: { admin: {
    getUserById: async (id) => {
      assert.equal(id, state.memberId);
      return { data: { user: { id, email: state.authEmail } }, error: null };
    },
    updateUserById: async (id, change) => {
      state.authUpdates.push({ id, change });
      state.authEmail = change.email;
      return { data: { user: { id, email: change.email } }, error: null };
    },
    generateLink: async ({ email }) => {
      state.linkGenerations += 1;
      assert.equal(email, state.profileEmail);
      return { data: { user: { id: state.memberId }, properties: {
        hashed_token: 'verified-token', email_otp: '12345678',
      } }, error: null };
    },
  } },
};
const publicAuth = { auth: { verifyOtp: async ({ token_hash, email, token }) => {
  if (token_hash) assert.equal(token_hash, 'verified-token');
  else {
    assert.equal(email, state.profileEmail);
    assert.equal(token, '12345678');
  }
  return { data: { user: { id: state.memberId }, session: {
    access_token: 'access-for-existing-sara', refresh_token: 'refresh-for-existing-sara',
  } }, error: null };
} } };

function imported(id) {
  if (id.includes('/http/server.ts')) return { serve: (fn) => { handlers[global.currentFunction] = fn; } };
  if (id.startsWith('https://esm.sh')) return { createClient: (_url, key) => key === 'service-key' ? admin : publicAuth };
  if (id.endsWith('/cors.ts')) return {
    corsHeaders: {}, handleCors: () => null,
    jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    errorResponse: (error, status = 500) => new Response(JSON.stringify({ error }), { status }),
  };
  throw new Error(`Unexpected import ${id}`);
}

global.Deno = { env: { get: (key) => ({
  SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_ANON_KEY: 'anon-key', RESEND_API_KEY: 'resend-key',
  FROM_EMAIL: 'HIVE <hive@example.test>',
})[key] ?? '' } };
global.fetch = async (_url, options) => {
  state.sent.push(JSON.parse(options.body));
  return new Response('{}', { status: 200 });
};

for (const name of ['request-email-code', 'verify-email-code']) {
  global.currentFunction = name;
  const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', name, 'index.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('require', 'exports', code)(imported, {});
}

const post = (name, body) => handlers[name](new Request(`https://offline.invalid/${name}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

(async () => {
  const uninvited = await post('request-email-code', { email: 'stranger@yahoo.test' });
  assert.equal(uninvited.status, 200);
  assert.equal(state.sent.length, 0, 'an uninvited address gets no code');

  const requested = await post('request-email-code', { email: state.profileEmail });
  assert.equal(requested.status, 200);
  assert.equal(state.sent.length, 1);
  assert.deepEqual(state.sent[0].to, [state.profileEmail]);
  assert.equal(state.authUpdates.length, 0, 'requesting a code cannot change the Auth account');
  assert.equal(state.linkGenerations, 0, 'a contact email cannot create a second Auth ID');
  const code = state.sent[0].text.match(/sign-in code is (\d{8})/)[1];

  const wrong = await post('verify-email-code', { email: state.profileEmail, code: code === '00000000' ? '99999999' : '00000000' });
  assert.equal(wrong.status, 400);
  assert.equal(state.authUpdates.length, 0, 'a wrong code cannot change the Auth account');
  assert.equal(state.challenge.attempts, 1);

  const verified = await post('verify-email-code', { email: state.profileEmail, code });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), {
    access_token: 'access-for-existing-sara', refresh_token: 'refresh-for-existing-sara',
  });
  assert.deepEqual(state.authUpdates, [{
    id: state.memberId, change: { email: state.profileEmail, email_confirm: true },
  }]);
  assert.equal(state.linkGenerations, 1);
  assert.equal(state.challenge, null, 'successful proof consumes the challenge');

  const returning = await post('request-email-code', { email: state.profileEmail });
  assert.equal(returning.status, 200);
  assert.equal(state.linkGenerations, 2, 'later sign-ins use the attached email identity');
  const signedInAgain = await post('verify-email-code', { email: state.profileEmail, code: '12345678' });
  assert.equal(signedInAgain.status, 200);
  assert.equal(state.authUpdates.length, 1, 'later sign-ins do not repeat account recovery');
  console.log('PASS: Hotmail code signs into the existing member ID; wrong codes and uninvited addresses cannot.');
})().catch((error) => { console.error(error); process.exit(1); });

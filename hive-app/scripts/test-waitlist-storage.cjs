// Disposable local Postgres only. No hosted credentials, TCP listener, email,
// Supabase project, or real signup is used. Requires PostgreSQL tools on PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { before, after, test } = require('node:test');
const { groupWaitlistByHive } = require('../lib/waitlist.ts');

const execute = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const migrations = path.join(root, 'hive-app/supabase/migrations');
const read = (name) => fs.readFileSync(path.join(migrations, name), 'utf8');
const upgrade = read('20261105224426_preserve_waitlist_hive_interests.sql');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-waitlist-'));
const socket = path.join(temp, 'socket');
const data = path.join(temp, 'data');
fs.mkdirSync(socket);
const port = '55484';
const pg = (name) => process.env.HIVE_TEST_PG_BIN ? path.join(process.env.HIVE_TEST_PG_BIN, name) : name;
const env = { ...process.env, PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGOPTIONS: '' };
const args = ['-X', '--no-password', '-h', socket, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = (text) => execFileSync(pg('psql'), args, { input: text, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const quote = (value) => value == null ? 'null' : `'${String(value).replace(/'/g, "''")}'`;
const rows = (where) => JSON.parse(sql(`select coalesce(json_agg(w), '[]'::json) from (select * from public.waitlist where ${where}) w;`));
let started = false;
let beforeSecurity;
let legacy;

const security = () => JSON.parse(sql(`select json_build_object(
  'table', (select json_build_object('acl', relacl::text, 'rls', relrowsecurity) from pg_class where oid = 'public.waitlist'::regclass),
  'rpc', (select json_build_object('acl', proacl::text, 'definer', prosecdef, 'config', proconfig, 'returns', prorettype::regtype::text)
    from pg_proc where oid = 'public.join_waitlist(text,text,text,text,text)'::regprocedure),
  'policies', (select json_agg(p order by policyname) from pg_policies p where schemaname = 'public' and tablename = 'waitlist')
);`));

before(() => {
  execFileSync(pg('initdb'), ['-D', data, '--username=postgres', '--no-locale', '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject'], { env, stdio: 'pipe' });
  execFileSync(pg('pg_ctl'), ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-h '' -k ${socket} -p ${port}`, '-w', 'start'], { env, stdio: 'pipe' });
  started = true;
  assert.equal(sql('show listen_addresses;'), '', 'test database must have no TCP listener');
  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
    grant usage on schema auth to authenticated;
    create table public.profiles (id uuid primary key, email text, is_owner boolean default false);
    create table public.community_memberships (user_id uuid, role text);
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    insert into public.profiles values
      ('00000000-0000-0000-0000-000000000001', 'owner@example.invalid', true),
      ('00000000-0000-0000-0000-000000000002', 'member@example.invalid', false);
  `);
  // Execute the relevant actual historical DDL, not a reimplementation of it.
  const owner = read('128_owner_is_not_admin.sql');
  sql(owner.slice(owner.indexOf('create or replace function public.is_hive_owner()'), owner.indexOf('-- A guard for the same question')));
  sql(read('013_waitlist.sql').split('-- Fix community_invites RLS')[0]);
  const policies = read('147_the_medium_locks.sql');
  sql(policies.slice(policies.indexOf('drop policy if exists "Community admins can view waitlist"'), policies.indexOf('-- 2. A row could walk')));
  sql(read('168_the_waitlist_grows_up.sql'));
  sql(`insert into public.waitlist (email, name, message, interested_in, status, source, created_at)
    values ('legacy@example.invalid', 'Legacy person', 'Keep this note', 'default', 'invited', 'join-page', '2026-01-01T00:00:00Z');`);
  legacy = rows("email = 'legacy@example.invalid'")[0];
  beforeSecurity = security();
  execFileSync(pg('psql'), [...args, '--single-transaction'], { input: upgrade, env, stdio: 'pipe' });
}, { timeout: 30000 });

after(() => {
  if (started) execFileSync(pg('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { env, stdio: 'pipe' });
  fs.rmSync(temp, { recursive: true, force: true });
});

test('upgrade preserves legacy fields, backfills interest, and leaves ACL/RLS unchanged', () => {
  const upgraded = rows("email = 'legacy@example.invalid'")[0];
  assert.deepEqual(upgraded.interest_slugs, ['default']);
  delete upgraded.interest_slugs;
  assert.deepEqual(upgraded, legacy);
  assert.deepEqual(security(), beforeSecurity);
});

test('both signup orders retain two interests and repeated requests are idempotent', () => {
  for (const [email, slugs] of [['forward@example.invalid', ['default', 'tech']], ['reverse@example.invalid', ['tech', 'default']]]) {
    for (const slug of [...slugs, ...slugs]) sql(`set role anon; select public.join_waitlist(${quote(email)}, null, null, ${quote(slug)}, 'newsletter');`);
    const records = rows(`email = ${quote(email)}`);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].interest_slugs, ['default', 'tech']);
    assert.equal(records[0].status, 'new');
  }
});

test('simultaneous upserts cannot lose the first interest', async () => {
  await Promise.all(['default', 'tech'].map((slug) => execute(pg('psql'), [...args, '-c',
    `begin; set local role anon; select public.join_waitlist('concurrent@example.invalid', null, null, '${slug}', 'newsletter'); select pg_sleep(0.15); commit;`], { env })));
  assert.deepEqual(rows("email = 'concurrent@example.invalid'")[0].interest_slugs, ['default', 'tech']);
});

test('blank interest preserves existing asks, notes and passed status; /join still inserts', () => {
  sql(`insert into public.waitlist (email, name, message, interested_in, status, source, interest_slugs)
    values ('passed@example.invalid', 'Keep name', 'Keep note', 'default', 'passed', 'join-page', array['default']);
    set role anon;
    select public.join_waitlist('passed@example.invalid', null, null, 'tech', 'newsletter');
    select public.join_waitlist('passed@example.invalid', null, null, null, 'public-site');`);
  const record = rows("email = 'passed@example.invalid'")[0];
  assert.deepEqual(record.interest_slugs, ['default', 'tech']);
  assert.equal(record.status, 'passed');
  assert.equal(record.name, 'Keep name');
  assert.equal(record.message, 'Keep note');
  assert.equal(record.source, 'join-page');
  sql(`set role authenticated; insert into public.waitlist (email, name) values ('member@example.invalid', 'General interest');`);
  assert.deepEqual(rows("email = 'member@example.invalid'")[0].interest_slugs, []);
});

test('invalid email and overlength requests never create records', () => {
  for (const email of ['sam example@example.invalid', 'sam@exampleinvalid', 'sam@exam\nple.invalid', 's'.repeat(250) + '@example.invalid']) {
    assert.throws(() => sql(`set role anon; select public.join_waitlist(${quote(email)}, null, null, 'tech', 'newsletter');`), /Command failed/);
    assert.equal(rows(`email = ${quote(email)}`).length, 0);
  }
});

test('anonymous callers get void and cannot read or directly insert; owners can read both interests', () => {
  assert.equal(sql(`set role anon; select public.join_waitlist('private@example.invalid', null, null, 'tech', 'newsletter');`), '');
  assert.throws(() => sql('set role anon; select * from public.waitlist;'), /Command failed/);
  assert.throws(() => sql("set role anon; insert into public.waitlist(email) values ('direct@example.invalid');"), /Command failed/);
  const own = sql(`set role authenticated;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
    set request.jwt.claim.email = 'member@example.invalid';
    select json_agg(email) from public.waitlist;`);
  assert.deepEqual(JSON.parse(own), ['member@example.invalid']);
  const ownerRows = JSON.parse(sql(`set role authenticated;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
    select json_agg(w) from (select email, interested_in, interest_slugs from public.waitlist where email = 'forward@example.invalid') w;`));
  assert.deepEqual(ownerRows[0].interest_slugs, ['default', 'tech']);
});

test('actual emitted forms → actual handler → SQL RPC → owner Waiting folders, offline', async () => {
  const source = fs.readFileSync(path.join(root, 'site/api/interested.js'), 'utf8');
  const handler = new vm.Script(source.replace('export default async function handler', 'async function handler') + '\nhandler;').runInNewContext({
    process: { env: { SUPABASE_URL: 'https://offline.invalid', SUPABASE_ANON_KEY: 'offline-fixture' } },
    fetch: async (url, options) => {
      if (options.method !== 'POST') {
        assert.match(url, /^https:\/\/offline\.invalid\/rest\/v1\/public_hives\?/);
        return { ok: true, json: async () => [{ name: url.includes('eq.tech') ? 'Tech HIVE' : 'OG HIVE' }] };
      }
      assert.equal(url, 'https://offline.invalid/rest/v1/rpc/join_waitlist');
      const p = JSON.parse(options.body);
      try {
        sql(`set role anon; select public.join_waitlist(${[p.p_email, p.p_name, null, p.p_interested_in, p.p_source].map(quote).join(', ')});`);
        return { ok: true };
      } catch { return { ok: false }; }
    },
  });
  const request = async (method, query) => {
    const res = { setHeader() {}, status() { return this; }, send(body) { this.body = body; }, json(body) { this.body = body; } };
    await handler({ method, query }, res);
    return res.body;
  };
  for (const hive of ['default', 'tech']) {
    const html = await request('GET', { hive });
    let click;
    const elements = { em: { value: 'sam-flow@example.invalid', style: {} }, out: {}, go: { style: {}, addEventListener(_, fn) { click = fn; } } };
    new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]).runInNewContext({
      document: { getElementById: (id) => elements[id] },
      window: { location: { pathname: '/api/interested', search: `?hive=${hive}` } },
      URLSearchParams,
      fetch: async (url, options) => {
        assert.equal(options.method, 'POST');
        const target = new URL(url, 'https://offline.invalid');
        return { json: async () => request('POST', Object.fromEntries(target.searchParams)) };
      },
    });
    click();
    await new Promise(setImmediate);
    assert.match(elements.out.innerHTML, /You're on the list/);
  }
  const ownerData = JSON.parse(sql(`set role authenticated;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
    select json_agg(w) from (select * from public.waitlist where status = 'new' and email = 'sam-flow@example.invalid') w;`));
  assert.equal(ownerData.length, 1);
  assert.deepEqual(ownerData[0].interest_slugs, ['default', 'tech']);
  const waiting = groupWaitlistByHive(ownerData, [{ id: 'og', slug: 'default' }, { id: 'tech', slug: 'tech' }], {}, {});
  assert.equal(waiting.og[0].email, 'sam-flow@example.invalid');
  assert.equal(waiting.tech[0].email, 'sam-flow@example.invalid');
});

test('reapplying the additive migration preserves requests and permissions', () => {
  const beforeRows = rows('true');
  execFileSync(pg('psql'), [...args, '--single-transaction'], { input: upgrade, env, stdio: 'pipe' });
  assert.deepEqual(rows('true').sort((a, b) => a.id.localeCompare(b.id)), beforeRows.sort((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual(security(), beforeSecurity);
});

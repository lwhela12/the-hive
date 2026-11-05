// Exercise the real GET response and its emitted click handler, entirely offline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../api/interested.js'), 'utf8');
const cases = [
  ['ordinary valid email', 'jane@example.com', true],
  ['s in local part', 'sam@example.com', true],
  ['s in domain', 'jane@site.com', true],
  ['trimmed valid email', '  sam@example.com  ', true],
  ['space in local part', 'jane example@example.com', false],
  ['space in domain', 'jane@exam ple.com', false],
  ['tab in local part', 'jane\texample@example.com', false],
  ['newline in domain', 'jane@exam\nple.com', false],
  ['missing domain dot', 'jane@examplecom', false],
  ['missing at sign', 'jane.example.com', false],
  ['multiple at signs', 'jane@@example.com', false],
  ['empty email', '', false],
];

function loadHandler(hive) {
  const calls = [];
  const handler = new vm.Script(source.replace('export default async function handler', 'async function handler') + '\nhandler;')
    .runInNewContext({
      process: { env: { SUPABASE_URL: 'https://offline.invalid', SUPABASE_ANON_KEY: 'offline-fixture' } },
      fetch: async (url, options) => {
        calls.push({ url, options });
        if (options.method === 'POST') {
          assert.equal(url, 'https://offline.invalid/rest/v1/rpc/join_waitlist');
          return { ok: true };
        }
        assert.equal(url, `https://offline.invalid/rest/v1/public_hives?slug=eq.${hive}&select=name,accent_color`);
        return { ok: true, json: async () => [{ name: hive === 'tech' ? 'Tech HIVE' : 'OG HIVE' }] };
      },
    });
  return { handler, calls };
}

async function request(handler, method, query) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method, query }, response);
  return response;
}

function runClient(html, hive, value, search = `?hive=${hive}&name=Offline`) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'GET must emit one inline script');
  let click;
  const elements = {
    go: { disabled: false, style: {}, addEventListener(event, fn) { assert.equal(event, 'click'); click = fn; } },
    out: { textContent: '', innerHTML: '' },
    em: { value, style: {} },
  };
  const submissions = [];
  new vm.Script(scripts[0][1]).runInNewContext({
    document: { getElementById(id) { assert.ok(elements[id]); return elements[id]; } },
    window: { location: { pathname: '/api/interested', search } },
    URLSearchParams,
    fetch: async (url, options) => {
      submissions.push({ url, options });
      return { json: async () => ({ ok: true }) };
    },
  });
  assert.equal(typeof click, 'function');
  click();
  return { elements, submissions };
}

for (const hive of ['default', 'tech']) {
  test(`${hive}: emitted GET script validates email and preserves routing`, async (t) => {
    const { handler, calls } = loadHandler(hive);
    const response = await request(handler, 'GET', { hive });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.match(response.body, hive === 'tech' ? /Want in on Tech HIVE/ : /Want in on OG HIVE/);
    assert.equal(calls.length, 1, 'GET only performs the offline label lookup');
    for (const [label, value, valid] of cases) {
      await t.test(label, async () => {
        const { elements, submissions } = runClient(response.body, hive, value);
        assert.equal(submissions.length, valid ? 1 : 0);
        if (valid) {
          const submitted = new URL(submissions[0].url, 'https://offline.invalid');
          assert.equal(submitted.pathname, '/api/interested');
          assert.equal(submitted.searchParams.get('hive'), hive);
          assert.equal(submitted.searchParams.get('name'), 'Offline');
          assert.equal(submitted.searchParams.get('email'), value.trim());
          assert.equal(submissions[0].options.method, 'POST');
          assert.equal(elements.go.disabled, true);
          // Let the emitted script's mocked fetch/json promise chain finish.
          await new Promise(setImmediate);
          assert.match(elements.out.innerHTML, /You're on the list/);
          assert.equal(elements.go.style.display, 'none');
          assert.equal(elements.em.style.display, 'none');
        } else {
          assert.match(elements.out.textContent, /That email looks off/);
          assert.equal(elements.go.disabled, false);
        }
      });
    }
  });

  test(`${hive}: server validation and confirmation route stay intact`, async () => {
    const { handler, calls } = loadHandler(hive);
    for (const [, email, valid] of cases) {
      if (valid) continue;
      const response = await request(handler, 'POST', { hive, email });
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.ok, false);
    }
    assert.equal(calls.length, 0, 'invalid POSTs never reach the backend');
    const confirmation = await request(handler, 'GET', { hive, email: 'sam@example.com' });
    assert.match(confirmation.body, /class="who">sam@example.com/);
    assert.doesNotMatch(confirmation.body, /id="em"/);
    assert.equal(calls.length, 1, 'valid GET only looks up the label');
    const search = `?hive=${hive}&email=sam%40example.com&name=Offline`;
    const { elements, submissions } = runClient(confirmation.body, hive, undefined, search);
    assert.equal(submissions[0].url, `/api/interested${search}`);
    assert.equal(submissions[0].options.method, 'POST');
    await new Promise(setImmediate);
    assert.match(elements.out.innerHTML, /You're on the list/);
    const response = await request(handler, 'POST', { hive, email: ' SAM@EXAMPLE.COM ', name: 'Offline' });
    assert.equal(response.body.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      p_email: 'sam@example.com', p_name: 'Offline', p_interested_in: hive, p_source: 'newsletter',
    });
  });
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
global.Deno = { env: { get: key => key === 'RESEND_API_KEY' ? 'offline-fixture-only' : undefined } };
const deliveries = [];
global.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); deliveries.push(JSON.parse(options.body)); return { ok: true }; };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const mail = require('../supabase/functions/_shared/reachMail.ts');
const db = row => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: row, error: null }) }) });
(async () => {
  const revisions = {};
  for (const kind of Object.keys(mail.REACH_COLUMNS)) revisions[kind] = await mail.templateRevision(kind);
  if (process.argv.includes('--revisions')) { console.log(JSON.stringify(revisions)); return; }
  for (const kind of Object.keys(revisions)) {
    assert.equal(await mail.templateIsApproved(db(null), kind), false);
    assert.equal(await mail.templateIsApproved(db({ approved: true, revision: 'old' }), kind), false);
    assert.equal(await mail.templateIsApproved(db({ approved: false, revision: revisions[kind] }), kind), false);
    assert.equal(await mail.templateIsApproved(db({ approved: true, revision: revisions[kind] }), kind), true);
    const letter = mail.genericLetter(kind, { buttonLabel: 'unreviewed copy', href: '/private', hiveId: 'pro' });
    assert.equal(letter.buttonLabel, mail.TEMPLATE_BUTTONS[kind]);
    const pro = await mail.scopeLetter(db({ slug: 'show', accent_color: '#1f0338' }), letter);
    const wide = await mail.scopeLetter(db(null), { ...letter, hiveId: null });
    assert.match(mail.reachEmailHtml({ ...pro, toName: '' }), /production-hive.png/);
    assert.doesNotMatch(mail.reachEmailHtml({ ...wide, toName: '' }), /production-hive.png/);
    assert.equal(mail.plainTextFrom(mail.reachEmailHtml({ ...pro, toName: '' })), mail.plainTextFrom(mail.reachEmailHtml({ ...wide, toName: '' })));
    assert.equal((await mail.sendReachEmail(db(null), 'fixture', kind, letter)).reason, 'template not approved');
    assert.equal((await mail.sendReachEmail(db({ approved: true, revision: revisions[kind] }), 'fixture', kind, { ...letter, said: 'private post' })).reason, 'template words changed');
  }
  // Exercise the actual sending door, including scope lookup and provider payload.
  for (const [kind, hiveId] of [['message', 'pro'], ['mention', null]]) {
    const scopedDb = { from(table) {
      const data = table === 'email_template_approvals' ? { approved: true, revision: revisions[kind] }
        : table === 'communities' ? { slug: 'show', accent_color: '#1f0338' }
        : table === 'profiles' ? { email: 'fixture@example.invalid', name: 'Reader' } : [];
      return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data, error: null }), then: resolve => Promise.resolve({ data, error: null }).then(resolve) };
    } };
    const letter = mail.genericLetter(kind, { buttonLabel: '', href: '/fixture', hiveId });
    assert.equal((await mail.sendReachEmail(scopedDb, 'fixture', kind, letter)).sent, true);
    const payload = deliveries.at(-1);
    if (hiveId) assert.match(payload.html, /production-hive.png/);
    else assert.doesNotMatch(payload.html, /production-hive.png/);
    const scoped = await mail.scopeLetter(scopedDb, letter);
    assert.equal(payload.html, mail.reachEmailHtml({ ...scoped, toName: 'Reader' }));
  }
  assert.equal(deliveries.length, 2);
  const migration = fs.readFileSync('supabase/migrations/234_email_template_approvals.sql', 'utf8');
  for (const kind of ['message','mention','boardReply']) assert.ok(migration.includes(`('${kind}', '${revisions[kind]}', true`));
  for (const kind of ['checkIn','monthCheckIn']) assert.ok(migration.includes(`('${kind}', '${revisions[kind]}', false`));
  assert.match(migration, /enable row level security/i);
  const panels = fs.readFileSync('components/admin/GodModePanels.tsx','utf8');
  assert.doesNotMatch(panels, /key: 'checkins'|checkInSchedule\.map/);
  assert.match(panels, /CheckInAnswersPanel hives/);
  console.log('PASS: 5 revision gates, 3 reviewed seeds only, scope branding/prose parity, stale/missing/revoked fail closed, altered prose refused, central archive navigation. No network or mail.');
})().catch(e => { console.error(e); process.exitCode = 1; });

const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: m, exports: m.exports, Date, Promise, console });
  return m.exports;
}
const { applyCarryForwardStatuses } = load('lib/carryForward.ts');
const { fetchCheckInActionItems } = load('lib/checkInActionItems.ts');
const { hasMeaningfulActionItemText } = load('lib/actionItemDisplay.ts');
function fixture(mode) {
  const rows = [{ id: 'task', completed: false, archived_at: null }, { id: 'old', completed: false, archived_at: null }];
  const writes = [];
  return { rows, writes, client: { from(table) {
    assert.equal(table, 'action_items');
    let payload, ids, owner;
    const q = {
      update(p) { payload = p; return q; }, select() { return q; },
      in(k, v) { assert.equal(k, 'id'); ids = v; return q; },
      eq(k, v) { assert.equal(k, 'assigned_to'); owner = v; return q; },
      or() { return q; }, is() { return q; },
      then(resolve, reject) {
        assert.equal(owner, 'member');
        if (mode === 'network') return Promise.reject(Error('offline')).then(resolve, reject);
        if (payload) {
          writes.push(payload);
          if (mode === 'error') return Promise.resolve({ error: 'denied' }).then(resolve, reject);
          if (mode !== 'rls') rows.filter(r => ids.includes(r.id)).forEach(r => Object.assign(r, payload));
        }
        return Promise.resolve({ data: rows.filter(r => ids.includes(r.id)), error: null }).then(resolve, reject);
      },
    };
    return q;
  } } };
}
(async () => {
  for (const mode of ['success', 'error', 'network', 'rls']) {
    const f = fixture(mode);
    const result = await applyCarryForwardStatuses(f.client, 'member', [
      { id: 'task', type: 'action_item', status: 'done' },
      { id: 'old', type: 'action_item', status: 'archive' },
      { id: 'wish', type: 'wish', status: 'done' },
    ]);
    assert.equal(!!result.error, mode !== 'success', mode);
    if (mode === 'success') {
      assert.equal(f.rows[0].completed, true);
      assert.ok(f.rows[0].completed_at);
      assert.ok(f.rows[1].archived_at);
      assert.equal(f.writes.length, 2, 'wish is not a task write');
    }
  }
  const source = Array.from({ length: 405 }, (_, id) => ({ id }));
  let pages = 0;
  const all = await fetchCheckInActionItems(() => ({ range: async (start, end) => { pages++; return { data: source.slice(start, end + 1), error: null }; } }));
  assert.equal(all.data.length, 405); assert.equal(pages, 3);
  const failed = await fetchCheckInActionItems(() => ({ range: async start => start ? { error: 'offline' } : { data: source.slice(0, 200) } }));
  assert.ok(failed.error); assert.equal(failed.data.length, 0, 'partial list is never presented as complete');
  assert.equal(hasMeaningfulActionItemText('@og (re: Meghan)'), false);
  assert.equal(hasMeaningfulActionItemText('@nat (re: Meghan)'), false);
  assert.equal(hasMeaningfulActionItemText('Sent short workout videos'), true);
  console.log('PASS: task completion/archive writes, ownership filters, error/network/silent-RLS failures, complete pagination, partial-load failure and accidental-note filtering. Offline fixtures.');
})().catch(error => { console.error(error); process.exitCode = 1; });

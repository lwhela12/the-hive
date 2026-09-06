const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const source = fs.readFileSync('lib/dues.ts', 'utf8');
const moduleBox = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  {
    module: moduleBox,
    exports: moduleBox.exports,
    Date,
    Set,
    require: (name) => {
      if (name === './honeyPotPayment') return { HONEY_POT_CASH_APP_HANDLE: '$HiveLV' };
      throw new Error(`Unexpected import: ${name}`);
    },
  },
);

const dues = moduleBox.exports;
const quarterCases = [
  [new Date(2026, 0, 15), 1, '2026-03-31'],
  [new Date(2026, 3, 1), 2, '2026-06-30'],
  [new Date(2026, 8, 6), 3, '2026-09-30'],
  [new Date(2026, 11, 31), 4, '2026-12-31'],
];

for (const [today, quarter, dateKey] of quarterCases) {
  const period = dues.getCurrentDuesPeriod(today);
  assert.equal(period.quarter, quarter);
  const event = dues.getQuarterlyDuesReminderEvent('og-hive', today);
  assert.equal(event.event_date, dateKey);
  assert.equal(event.title, `OG HIVE Q${quarter} dues due`);
  assert.equal(event.event_type, 'custom');
  assert.match(event.description, /\$HiveLV/);
  assert.equal(event.visibility, 'members');
  assert.equal(event.invited_scope, 'members');
  assert.ok(dues.isQuarterlyDuesReminderEvent(event));
}

const member = { id: 'member-one', name: 'One Member', email: 'one@example.com' };
const q3 = { year: 2026, quarter: 3 };
assert.equal(dues.duesTransactionsCoverMember([], member, q3), false);
assert.equal(dues.duesTransactionsCoverMember([{
  related_user_id: member.id,
  transaction_type: 'deposit',
  amount: 25,
  dues_year: 2026,
  dues_quarter: 3,
  dues_covered_quarters: 1,
}], member, q3), true);
assert.equal(dues.duesTransactionsCoverMember([{
  related_user_id: member.id,
  transaction_type: 'deposit',
  amount: 100,
  dues_year: 2026,
  dues_quarter: null,
  dues_covered_quarters: 4,
}], member, q3), true);

const home = fs.readFileSync('app/(app)/hive.tsx', 'utf8');
const helper = fs.readFileSync('app/(app)/meeting-helper.tsx', 'utf8');
const dataHook = fs.readFileSync('lib/hooks/useHiveDataQuery.ts', 'utf8');
assert.match(home, /getDuesPeriodEndDate\(period\)/, 'Home to-do uses quarter end');
assert.match(home, /duesEnabled && community\?\.slug === 'default'/, 'Only OG receives the reminder');
assert.match(home, /isQuarterlyDuesReminderEvent\(event\)/, 'Calendar reminder opens its real destination');
assert.match(dataHook, /getQuarterlyDuesReminderEvent\(communityId, now\)/, 'Upcoming Events includes the generated reminder');
assert.match(helper, /getQuarterlyDuesReminderEvent\(communityId\)/, 'Meeting Helper calendar includes the reminder');
assert.match(helper, /duesTransactionsCoverMember\(duesLedgerRows, member, currentDuesPeriod\)/, 'Treasurer slide reads the ledger per member');

console.log('PASS: OG quarter-end dates, member-only calendar reminder, ledger coverage, Home to-do, Meeting Helper calendar and Treasurer snapshot. Offline only.');

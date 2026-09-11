import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sender = read('supabase/functions/notify-admin-activity/index.ts');
const settings = read('app/(app)/settings.tsx');
const migration = read('supabase/migrations/261_members_choose_hive_activity_mail.sql');
const failures = [];

if (/\.eq\('is_owner', true\).*\.eq\('email_admin_activity_enabled', true\)/s.test(sender)) {
  failures.push('Activity subscribers are still restricted to owners.');
}
if (!sender.includes("from('community_memberships').select('user_id')")) {
  failures.push('Member activity mail is not scoped through community membership.');
}
if (!/subscriber\.is_owner === true \|\| memberIds\.has\(subscriber\.id\)/.test(sender)) {
  failures.push('Recipients are not limited to owners or members of the activity HIVE.');
}
if (!settings.includes('label="Notify me about everything"')
  || !settings.includes('profile.email_admin_activity_enabled === true')) {
  failures.push('Settings does not expose the explicit, default-off activity switch.');
}
if (!migration.includes('alter column email_admin_activity_enabled set default false')
  || !migration.includes("lower(email) = 'natwalstead@gmail.com'")) {
  failures.push('Migration does not default everyone off while preserving Nat on.');
}

if (failures.length) {
  console.error('Activity mail contract failed.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Activity mail: every member has a default-off, HIVE-scoped choice; Nat starts on.');

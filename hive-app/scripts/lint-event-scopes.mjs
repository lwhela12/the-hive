import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const composers = [
  'app/(app)/hive.tsx',
  'app/(app)/admin.tsx',
  'app/(app)/monthly-tuneup.tsx',
  'app/(app)/meeting-helper.tsx',
];

for (const file of composers) {
  if (!read(file).includes('<EventScopeFields')) {
    failures.push(`${file} must ask visibility and invitation as separate questions.`);
  }
}

const birthdayEditors = [
  'app/(app)/hive.tsx',
  'app/(app)/profile.tsx',
  'app/(app)/members.tsx',
];
for (const file of birthdayEditors) {
  if (!/<EventScopeFields[\s\S]{0,350}\ballowPublic\b/.test(read(file))) {
    failures.push(`${file} must let a member publish their own birthday.`);
  }
}

const fields = read('components/events/EventAudienceToggle.tsx');
if (/visibility === 'public' \? 'all_hives'/.test(fields)) {
  failures.push('Birthday saves must not silently demote Public to HIVE-Wide.');
}
if (!/RANK\[invitedScope\] > RANK\[visibility\]/.test(fields)) {
  failures.push('Birthday invitation reach must be clamped to visibility reach.');
}

const migration = read('supabase/migrations/247_public_events_with_explicit_consent.sql');
for (const promise of [
  'publicly_listed = true',
  "birthday_visibility = 'public'",
  "c2.publicly_listed = true",
  "slug in ('default', 'tech')",
]) {
  if (!migration.includes(promise)) failures.push(`Migration 247 is missing: ${promise}`);
}

if (failures.length) {
  console.error('Event scopes: every composer keeps seeing and joining separate.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Event scopes: two independent ladders, self-approved public birthdays, and secret HIVEs stay private.');

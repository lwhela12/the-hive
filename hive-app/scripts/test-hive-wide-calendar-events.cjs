const assert = require('node:assert/strict');
const fs = require('node:fs');

const whatsNext = fs.readFileSync('lib/hooks/useWhatsNext.ts', 'utf8');
assert.match(
  whatsNext,
  /\.eq\('event_type', 'custom'\)/,
  'HIVE-Wide What’s Next includes ordinary calendar events',
);
assert.match(
  whatsNext,
  /isInvitedToEvent\(event, hiveIds\)/,
  'joining details only travel to people invited to the event',
);
assert.match(
  whatsNext,
  /\.or\(`event_date\.gte\.\$\{today\},end_date\.gte\.\$\{today\}`\)/,
  'an in-progress multi-day event remains in the shared diary',
);

const createEvent = fs.readFileSync('supabase/functions/create-event/index.ts', 'utf8');
assert.match(
  createEvent,
  /invited_scope: invitedScope/,
  'new events keep the invited scope selected in the form',
);
assert.match(
  createEvent,
  /SCOPE_RANK\[invitedScope\] > SCOPE_RANK\[visibility\]/,
  'the create path rejects an invitation wider than visibility',
);

const markerMigration = fs.readFileSync('supabase/migrations/245_hive_wide_quarter_markers.sql', 'utf8');
assert.equal(
  (markerMigration.match(/\('Q[1-4] 20\d{2} (?:begins|ends)', date '20\d{2}-\d{2}-\d{2}'\)/g) ?? []).length,
  11,
  'the remainder of 2026 and every 2027 quarter boundary are seeded',
);
assert.match(markerMigration, /'all_hives',\s*'all_hives'/, 'quarter markers are both visible and invited HIVE-Wide');
assert.match(markerMigration, /where not exists/, 'the marker seed is safe to apply more than once');

console.log('PASS: HIVE-Wide custom events render, private joining details stay private, and new event invitation scope persists.');

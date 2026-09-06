const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/239_the_brag_board_belongs_to_every_hive.sql',
  ),
  'utf8',
);
const lineBreakFix = fs.readFileSync(
  path.resolve(
    __dirname,
    '../supabase/migrations/240_brag_board_line_breaks.sql',
  ),
  'utf8',
);

assert.match(migration, /name = 'Brag Board'/, 'The existing board is renamed in place');
assert.match(migration, /reach = 'all_hives'/, 'The board reaches every HIVE');
assert.doesNotMatch(
  migration,
  /insert into public\.board_categories/i,
  'The migration must not make a duplicate board',
);

for (const promise of [
  'Wide categories viewable by any HIVE member',
  'Any HIVE member can post on HIVE-Wide boards',
  'Authors can update own HIVE-Wide posts',
  'Any HIVE member can read HIVE-Wide board replies',
  'Any HIVE member can reply on HIVE-Wide boards',
  'Authors can update own HIVE-Wide replies',
  'Any HIVE member can read HIVE-Wide board reactions',
  'Any HIVE member can react on HIVE-Wide boards',
]) {
  assert.match(migration, new RegExp(`create policy "${promise}"`), promise);
}

assert.match(migration, /public\.is_any_community_member\(\)/, 'A signed-in HIVE member is required');
assert.match(migration, /public\.community_shares_beyond_hive/, 'The host HIVE sharing ceiling still wins');
assert.match(migration, /bp\.is_locked = false/, 'Locked threads stay locked');
assert.match(migration, /\*\*Stage:\*\* 🧪 Ready for beta testers/, 'The beta call reads at a glance');
assert.match(migration, /\*\*Stage:\*\* 🛠 Building/, 'Work in progress reads at a glance');
assert.match(migration, /\*\*Stage:\*\* ✨ Live/, 'Finished work reads at a glance');
assert.ok(
  lineBreakFix.includes("replace(content, E'\\\\n', E'\\n')"),
  'Seeded Markdown line breaks render instead of showing literal slash-n markers',
);
assert.doesNotMatch(
  lineBreakFix,
  /update public\.board_posts(?![\s\S]*category_id = brag_board_id)/,
  'The line-break repair stays scoped to the Brag Board',
);

console.log('PASS: one Tech-owned Brag Board reaches every HIVE with visible stages and full member participation. Offline only.');

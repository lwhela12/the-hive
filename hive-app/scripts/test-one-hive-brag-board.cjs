const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../supabase/migrations/20261009193000_one_hive_brag_board.sql'),
  'utf8',
);

assert.match(migration, /name = 'HIVE Brag Board'/, 'The canonical board gets one shared name');
assert.match(migration, /and is_pinned = true/, 'Only the duplicate welcome is retired');
assert.match(migration, /archived_at = coalesce\(archived_at, now\(\)\),[\s\S]*is_pinned = false/, 'The duplicate welcome is archived, never deleted');
assert.match(migration, /and archived_at is null/, 'Only visible OG threads move to the shared board');
assert.match(migration, /category_id = shared_board_id,[\s\S]*community_id = tech_hive_id,[\s\S]*visibility = 'all_hives'/, 'Every live OG brag thread travels to the shared board');
assert.match(migration, /update public\.board_replies/, 'Replies travel with the moved threads');
assert.match(migration, /update public\.board_reactions/, 'Reactions travel with the moved threads');
assert.match(migration, /where id = og_board_id/, 'The redundant OG board is archived rather than deleted');
assert.doesNotMatch(migration, /delete from public\.(board_categories|board_posts|board_replies|board_reactions)/i, 'No board history is deleted');
assert.match(migration, /There is one HIVE Brag Board for all of us/, 'What’s New tells the current one-board truth');

console.log('PASS: one shared Brag Board keeps every real thread and archives only duplicate structure.');

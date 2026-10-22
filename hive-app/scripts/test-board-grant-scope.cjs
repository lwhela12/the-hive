const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
const screen = read('app/(app)/board.tsx');
const migration = read('supabase/migrations/20261022194038_move_linkedin_article_to_things_we_learned.sql');

assert.match(
  screen,
  /!isCompletableHdAsk\(selectedCategory\)/,
  'Only HD Wish boards may offer the Granted action.',
);
assert.match(
  migration,
  /title = 'LinkedIn Article from a call'/,
  'The requested workflow thread is identified exactly.',
);
assert.match(
  migration,
  /name = 'Things We Learned'/,
  'The requested destination is identified by its board name.',
);
assert.match(
  migration,
  /visibility = 'members'/,
  'The moved thread follows the local Things We Learned board reach.',
);
assert.doesNotMatch(migration, /delete from public\.(board_posts|board_replies|board_reactions)/i, 'Moving the thread never deletes its history.');

console.log('PASS: Granted stays on HD Wish boards, and the LinkedIn thread moves without deleting its discussion.');

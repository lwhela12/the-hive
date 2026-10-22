const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
const screen = read('app/(app)/board.tsx');
const migration = read('supabase/migrations/20261022194038_move_linkedin_article_to_things_we_learned.sql');

const wishEditor = read('components/wishes/AddWishModal.tsx');
const wishActions = read('lib/hooks/useWishes.ts');
assert.doesNotMatch(screen, /Granted|linkedWish|LinkedWish|GrantWishModal|markBoardThreadGranted/, 'Boards have no wish lifecycle controls.');
assert.doesNotMatch(wishEditor, /linkedBoardCategory|syncWishEditToLinkedBoard/, 'Wish editing does not synchronize to a board.');
assert.doesNotMatch(wishActions, /source_board_post_id|source_wish_id|granted_wish_id/, 'Granting a wish does not complete a board or thread.');
for (const retiredModule of ['lib/wishBoardLinking.ts', 'lib/boardThreadCompletion.ts', 'lib/hooks/useBoardLinkedWishes.ts']) {
  assert.equal(fs.existsSync(path.resolve(__dirname, '..', retiredModule)), false, `${retiredModule} is retired`);
}
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

console.log('PASS: Boards and wishes are independent; the LinkedIn thread move preserves its discussion.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
const scope = read('lib/boardScope.ts');
const query = read('lib/hooks/useBoardQuery.ts');
const screen = read('app/(app)/board.tsx');

assert.match(scope, /return value === 'hive' \? 'hive' : 'all'/, 'The existing all-visible Boards view remains the safe default');
assert.match(query, /includeSharedBoards = true/, 'Board queries explicitly receive the display scope');
assert.match(query, /q = q\.eq\('community_id', communityId \?\? ''\)\.eq\('reach', 'hive'\)/, 'This HIVE excludes shared boards without widening access');
assert.match(query, /includeSharedBoards \? 'all' : 'hive'/, 'Each scope has a distinct cache entry');
assert.match(screen, /All boards/, 'Members can return to everything visible to them');
assert.match(screen, /This HIVE/, 'Members can focus on their current HIVE');
assert.match(screen, /the-hive:boards-scope:/, 'The choice is remembered per member and HIVE');
assert.match(screen, /boardScopeToggle = !isWide/, 'The control stays inside real HIVEs, not the HIVE-Wide-only route');

console.log('PASS: Boards remembers All boards or This HIVE without widening access.');

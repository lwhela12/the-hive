import assert from 'node:assert/strict';
import {
  normalizeBoardSort,
  sortBoardCategories,
} from '../lib/boardSort.ts';

const boards = [
  { id: 'z', name: 'Zinnias', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p', name: '{Potential} Ideas', created_at: '2026-02-01T00:00:00Z' },
  { id: 'a', name: 'Announcements', created_at: '2026-03-01T00:00:00Z' },
];

const stats = {
  z: { count: 1, latestActivity: '2026-09-01T00:00:00Z' },
  p: { count: 7, latestActivity: '2026-08-01T00:00:00Z' },
  a: { count: 2, latestActivity: '2026-09-05T00:00:00Z' },
};

const names = (sort) => sortBoardCategories(boards, sort, stats).map((board) => board.name);

assert.deepEqual(names('alphabetical'), ['Announcements', '{Potential} Ideas', 'Zinnias']);
assert.deepEqual(names('recent-activity'), ['Announcements', 'Zinnias', '{Potential} Ideas']);
assert.deepEqual(names('oldest-activity'), ['{Potential} Ideas', 'Zinnias', 'Announcements']);
assert.deepEqual(names('most-threads'), ['{Potential} Ideas', 'Announcements', 'Zinnias']);
assert.equal(normalizeBoardSort('not-a-real-sort'), 'alphabetical');

const emptyBoard = { id: 'empty', name: 'Empty', created_at: '2026-09-06T00:00:00Z' };
assert.equal(
  sortBoardCategories([...boards, emptyBoard], 'recent-activity', stats)[0].id,
  'empty',
  'An empty board sorts by the date the board was made',
);

console.log('PASS: boards sort A–Z, by activity in both directions, and by thread count.');

import assert from 'node:assert/strict';
import { normalizeBoardView } from '../lib/boardView.ts';

assert.equal(normalizeBoardView('tiles'), 'tiles');
assert.equal(normalizeBoardView('list'), 'list');
assert.equal(normalizeBoardView(null), 'tiles');
assert.equal(normalizeBoardView('anything-else'), 'tiles');

console.log('PASS: boards default safely to tiles and remember only known views.');

#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const source = readFileSync(path.join(ROOT, 'lib/checkIns.ts'), 'utf8');

const yearDecks = source.match(/const YEAR_QUESTIONS_BY_SLUG:[\s\S]*?\n};/)?.[0] ?? '';
const techDeck = yearDecks.match(/tech:\s*\[(.*?)\n\s*\],\n\s*show:/s)?.[1] ?? '';
const questionId = 'q_year_honey_pot';

if (!techDeck.includes(`'${questionId}'`)) {
  console.error('✗ Tech end-of-year check-in no longer revisits the September Honey Pot decision.');
  process.exit(1);
}

const otherDecks = yearDecks.replace(techDeck, '');
if ((otherDecks.match(new RegExp(questionId, 'g')) ?? []).length > 0) {
  console.error('✗ The Tech Honey Pot question leaked into another HIVE year deck.');
  process.exit(1);
}

console.log('✓ Tech year check-in: December revisits the Honey Pot decision only for Tech HIVE');

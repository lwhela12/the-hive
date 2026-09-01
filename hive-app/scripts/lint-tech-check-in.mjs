import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tech HIVE's check-in and Tech HIVE's deck must offer the same words.
 *
 * The deck counts a vote by matching the answer's TEXT against the ballot it
 * draws. Nothing enforces that at runtime — a straight apostrophe where the
 * survey has a curly one, or a dropped em dash, splits one vote into two rows
 * and the slide quietly reports a HIVE more divided than it is.
 *
 * So this compares the two files character by character: every vote the deck
 * draws must be asked by the check-in, with the same options in the same
 * order. It reads the real arrays, not a substring — a lint that a doc comment
 * can satisfy is a lint that passes while the code is broken.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deckSource = fs.readFileSync(path.join(root, 'app/(app)/meeting-helper.tsx'), 'utf8');
const checkInSource = fs.readFileSync(path.join(root, 'lib/checkIns.ts'), 'utf8');
const failures = [];

/** The text of a `[...]` array literal starting at `open`, brackets balanced. */
function arrayAt(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** Every quoted string in an array literal, in order, unescaped. */
function stringsIn(body) {
  const found = [];
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let match = pattern.exec(body);
  while (match) {
    found.push((match[1] ?? match[2]).replace(/\\(.)/g, '$1'));
    match = pattern.exec(body);
  }
  return found;
}

/** The `tech: {` entry of a top-level record, up to the next sibling key. */
function techBlock(source, after) {
  const start = source.indexOf('\n  tech: {', source.indexOf(after));
  if (start === -1) return null;
  const end = source.indexOf('\n  },\n', start);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

// --- What the deck draws: every `answerKey` with the ballot beside it. ---
const deck = techBlock(deckSource, 'const DECKS');
const deckBallots = new Map();
if (!deck) {
  failures.push('Could not find the tech deck in meeting-helper.tsx — this guard is no longer reading anything.');
} else {
  const keyPattern = /answerKey: '([a-z_]+)'/g;
  let match = keyPattern.exec(deck);
  while (match) {
    const optionsAt = deck.indexOf('options: [', match.index);
    // A vote block puts its options within a few lines of its key; the
    // Networking box has an answerKey and no ballot at all, which is fine.
    if (optionsAt !== -1 && optionsAt - match.index < 400) {
      deckBallots.set(match[1], stringsIn(arrayAt(deck, optionsAt + 'options: '.length) ?? ''));
    }
    match = keyPattern.exec(deck);
  }
}

// --- What the check-in asks: every `choice(id, text, [...])`. ---
const checkIn = techBlock(checkInSource, 'const PRE_MEETING_BY_SLUG');
const asked = new Map();
if (!checkIn) {
  failures.push('Could not find tech in PRE_MEETING_BY_SLUG — the check-in this guard protects is gone.');
} else {
  const choicePattern = /choice\(\s*\n?\s*'([a-z_]+)'/g;
  let match = choicePattern.exec(checkIn);
  while (match) {
    const optionsAt = checkIn.indexOf('[', match.index);
    asked.set(match[1], stringsIn(arrayAt(checkIn, optionsAt) ?? ''));
    match = choicePattern.exec(checkIn);
  }
  // Free-text answers the deck prints without a ballot still have to be asked.
  const textPattern = /q\(\s*'([a-z_]+)'/g;
  let textMatch = textPattern.exec(checkIn);
  while (textMatch) {
    if (!asked.has(textMatch[1])) asked.set(textMatch[1], null);
    textMatch = textPattern.exec(checkIn);
  }
}

if (deckBallots.size === 0 && !failures.length) {
  failures.push('The tech deck draws no votes at all — either the guard broke or the votes were removed.');
}

for (const [key, ballot] of deckBallots) {
  const survey = asked.get(key);
  if (survey === undefined) {
    failures.push(`The deck counts "${key}" and the check-in never asks it — that box can only ever be empty.`);
    continue;
  }
  if (survey === null) {
    failures.push(`The deck draws a ballot for "${key}" and the check-in asks it as free text — the votes will never match.`);
    continue;
  }
  if (survey.length !== ballot.length || survey.some((option, index) => option !== ballot[index])) {
    failures.push(
      `"${key}" is asked and counted with different words.\n`
      + `    check-in: ${JSON.stringify(survey)}\n`
      + `    deck:     ${JSON.stringify(ballot)}`
    );
  }
}

// The events box under the Plan cards prints a free-text answer. It told the
// room "the check-in asks, and answers land here" for a fortnight while
// nothing asked. Anything the deck reads has to be a question somewhere.
const underCards = deck?.match(/voicesUnderCards: \{[\s\S]*?answerKey: '([a-z_]+)'/);
if (underCards && !asked.has(underCards[1])) {
  failures.push(`The Plan slide prints "${underCards[1]}" under its cards and the check-in never asks it.`);
}

if (failures.length) {
  console.error('Tech check-in: every vote the deck counts is asked in the same words.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Tech check-in: every vote the deck counts is asked in the same words.');

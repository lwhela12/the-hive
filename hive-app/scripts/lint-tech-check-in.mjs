import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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
const presentationSource = fs.readFileSync(path.join(root, 'lib/checkInPresentation.ts'), 'utf8');
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

// Once Tech makes a decision, its deck should show the decision rather than
// invent an empty vote. Keep the ballot guard for any future live questions.
if (deckBallots.size === 0 && deck && !deck.includes("kind: 'deferred'")) {
  failures.push('The tech deck has no votes and no recorded Honey Pot decision — this guard may no longer be reading the active deck.');
}
if (deck?.includes("kind: 'deferred'")) {
  if (deckBallots.size > 0) failures.push('Tech has settled these questions; the deck must not show another vote.');
  if (!deck.includes("kind: 'plan'")) failures.push('Tech HIVE Help must show the adopted plan, not reopen the choice.');
  for (const month of ['October', 'November', 'December']) {
    if (!deck.includes(`${month} · `)) failures.push(`Tech HIVE Help is missing its ${month} step.`);
  }
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

// Tech's recurring raw survey still has a stable q_learned answer id. Exercise
// the presentation layer that turns it into the live tool-story → help flow;
// OG must keep its own HD prompt and answer wording.
const compiled = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const presentationModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  () => ({ formatDateShort: () => '', formatTimeRange: () => '' }),
  presentationModule,
  presentationModule.exports,
);
const questions = [
  { id: 'q_attendance', text: 'Will we see you?', type: 'choice' },
  { id: 'q_tech_working_on', text: 'What are you working on?', type: 'long' },
  { id: 'q_learned', text: 'What did you learn? (This feeds the Things We Learned board.)', type: 'long' },
  { id: 'q_tech_low', text: 'What was hard?', type: 'long' },
  { id: 'q_pop_priorities', text: 'Priorities', type: 'long' },
  { id: 'q_hard_out', text: 'Hard out', type: 'short' },
];
const techQuestions = presentationModule.exports.checkInQuestions(questions, false, 'tech');
const techLegacyQuestions = presentationModule.exports.checkInQuestions(questions.filter((question) => question.id !== 'q_learned'), false, 'tech');
const ogQuestions = presentationModule.exports.checkInQuestions(questions, false, 'default');
if (techQuestions.findIndex((question) => question.id === 'q_tech_working_on') >= techQuestions.findIndex((question) => question.id === 'q_learned')
    || techQuestions.findIndex((question) => question.id === 'q_learned') >= techQuestions.findIndex((question) => question.id === 'q_tech_low')
    || techQuestions.findIndex((question) => question.id === 'q_tech_low') >= techQuestions.findIndex((question) => question.id === 'q_hd_wish')) {
  failures.push('Tech must ask about current work, a high and a low before the optional help request.');
}
if (!techQuestions.find((question) => question.id === 'q_learned')?.text.includes('tech high')
    || !techLegacyQuestions.find((question) => question.id === 'q_learned')?.text.includes('tech high')
    || techQuestions.filter((question) => question.id === 'q_tech_working_on').length !== 1
    || techQuestions.filter((question) => question.id === 'q_tech_low').length !== 1
    || techQuestions.find((question) => question.id === 'q_hd_wish')?.required !== false) {
  failures.push('Tech’s monthly update or optional help request is missing from Before we meet.');
}
if (ogQuestions.find((question) => question.id === 'q_learned')?.text !== 'What did you learn? (This feeds the Things We Learned board.)'
    || ogQuestions.find((question) => question.id === 'q_hd_wish')?.text !== 'Choose your HD wish for this month') {
  failures.push('The Tech conversation must not rewrite OG’s check-in.');
}
if (!deckSource.includes("{ key: 'hummdinger', label: 'What We’re Trying' }")
    || (deckSource.match(/getTextAnswer\(answers, 'q_learned'\)/g) ?? []).length < 2
    || (deckSource.match(/getTextAnswer\(answers, 'q_tech_working_on'\)/g) ?? []).length < 2
    || (deckSource.match(/getTextAnswer\(answers, 'q_tech_low'\)/g) ?? []).length < 2) {
  failures.push('Tech’s monthly update must appear in both the group cards and expanded meeting view.');
}

if (failures.length) {
  console.error('Tech check-in: current decisions and any live votes match the deck.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Tech check-in: settled decisions do not show empty votes; any live ballots match the check-in.');

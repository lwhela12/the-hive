import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A switch that governs nothing is worse than no switch at all.
 *
 * Every kind of "somebody spoke to you" mail has three halves, and all three
 * have to exist together: a column on `profiles`, something that actually
 * sends it, and a row on the Settings page so a member can turn it off. Miss
 * the first and the gate reads undefined; miss the second and the page makes a
 * promise nothing keeps; miss the third and there is mail nobody can stop.
 *
 * So a FOURTH kind added to `REACH_COLUMNS` fails the build until all three
 * exist for it. This guard asserts on the real calls — `sendReachEmail(...,
 * 'kind', ...)` and the column strings in the settings list — never on a
 * substring that a doc comment could satisfy. It was proved red on each of its
 * three checks before being trusted green.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];

const reachMail = read('supabase/functions/_shared/reachMail.ts');
const settings = read('app/(app)/settings.tsx');
const senders = [
  'supabase/functions/notify-board-mention/index.ts',
  'supabase/functions/notify-board-reply/index.ts',
  'supabase/functions/notify-chat-mention/index.ts',
  'supabase/functions/notify-dm/index.ts',
  'supabase/functions/notify-wish-mention/index.ts',
].map((file) => ({ file, source: read(file) }));

// --- The kinds, read from the map itself: `mention: 'email_mention_enabled',`
const kinds = new Map();
const kindPattern = /^\s{2}(\w+): '(email_\w+)',$/gm;
let match = kindPattern.exec(reachMail);
while (match) {
  kinds.set(match[1], match[2]);
  match = kindPattern.exec(reachMail);
}

if (kinds.size === 0) {
  failures.push('No reach kinds found in _shared/reachMail.ts — this guard is reading nothing.');
}

// --- Half one: the gate must actually select every column, spelled out.
//     A computed select string makes the row `any` and stops the compiler
//     telling you when a column is wrong.
const selectLine = reachMail.match(/\.select\('email, name,([^']*)'\)/);
for (const [kind, column] of kinds) {
  if (!selectLine || !selectLine[1].includes(column)) {
    failures.push(`"${kind}" is declared and its column ${column} is never selected in mayReach().`);
  }
}

// --- Half two: something sends it.
for (const kind of kinds.keys()) {
  const callPattern = new RegExp(`sendReachEmails?\\([\\s\\S]{0,400}?'${kind}',`);
  const sender = senders.find(({ source }) => callPattern.test(source));
  if (!sender) {
    failures.push(`"${kind}" has a switch and nothing that sends it — no notify-* function calls sendReachEmail with it.`);
  }
}

// --- Half three: a member can turn it off.
for (const [kind, column] of kinds) {
  if (!new RegExp(`column: '${column}'`).test(settings)) {
    failures.push(`"${kind}" sends mail with no row on the Settings page — nobody can turn ${column} off.`);
  }
}

if (failures.length) {
  console.error('Reach mail: every kind has a column, a sender, and a switch.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Reach mail: every kind has a column, a sender, and a switch.');

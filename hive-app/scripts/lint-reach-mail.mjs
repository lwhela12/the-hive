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
// The switch list moved to lib/emailSettings.ts on 2026-09-02 so the halfway
// check-in could show the same rows; this guard follows it there.
const settings = read('lib/emailSettings.ts');
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
//
//     The check-in kinds are sent by the app's own send door rather than by a
//     notify-* function — Nat presses send on a survey she has just read
//     (2026-09-04) — and the newsletter by `send-newsletter`. They are listed
//     here so "something sends it" still means a real file, not an exemption.
const EXTRA_SENDERS = {
  checkIn: 'supabase/functions/open-check-in/index.ts',
  monthCheckIn: 'supabase/functions/open-check-in/index.ts',
};

for (const kind of kinds.keys()) {
  const callPattern = new RegExp(`sendReachEmails?\\([\\s\\S]{0,400}?'${kind}',`);
  const extra = EXTRA_SENDERS[kind];

  if (extra) {
    /**
     * A named sender may choose its kind at run time.
     *
     * `open-check-in` reads the survey's title to decide whether this is the
     * one that rides a meeting or the one that belongs to the month, so the
     * kind reaches `sendReachEmail` in a variable and no literal sits next to
     * the call. Requiring BOTH — that this file really does send reach mail,
     * and that it really does name this kind — keeps the check honest without
     * demanding the code be written the long way round.
     */
    //     The literal has to be in a VALUE position — `kind: 'checkIn',` — not
    //     in the type that lists both of them, which is where a first attempt
    //     at this check matched and passed a file that had stopped sending one
    //     of its kinds entirely (caught while proving this guard red).
    const source = read(extra)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const sends = /sendReachEmails?\(/.test(source);
    const names = new RegExp(`kind: '${kind}',`).test(source)
      || new RegExp(`sendReachEmails?\\([\\s\\S]{0,400}?'${kind}',`).test(source);
    if (!sends || !names) {
      failures.push(`"${kind}" is declared for ${extra}, and that file does not send it.`);
    }
    continue;
  }

  const sender = senders.find(({ source }) => callPattern.test(source));
  if (!sender) {
    failures.push(`"${kind}" has a switch and nothing that sends it — nothing calls sendReachEmail with it.`);
  }
}

// --- Half four, added 2026-09-04: every letter says which HIVE it is about.
//
//     `sendReachEmail` holds a letter while that HIVE is in its meeting
//     (`hiveIsMeetingNow`) — Nat: *"you wouldn't get an email notification, I
//     think, during the meeting."* It can only do that if the caller says whose
//     HIVE the thing belongs to, and nothing else would catch a caller that
//     forgot: these run on Deno, and `tsconfig.json` excludes them from `tsc`.
//     So a letter without `hiveId` fails the build instead of quietly emailing
//     eighteen people who are sitting in the room it is about.
const ALL_SENDERS = [
  ...senders,
  ...[...new Set(Object.values(EXTRA_SENDERS))].map((file) => ({ file, source: read(file) })),
];

for (const { file, source } of ALL_SENDERS) {
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (!/sendReachEmails?\(/.test(line)) return;
    // The letter is the object literal that follows; `hiveId:` has to be in it,
    // and it is always written beside the other hive facts.
    const letter = lines.slice(index, index + 22).join('\n');
    if (!/\bhiveId:/.test(letter)) {
      failures.push(
        `${file}:${index + 1} sends a letter with no hiveId, so it cannot be held while that HIVE is meeting.`,
      );
    }
  });
}

// --- Half three: a member can turn it off.
for (const [kind, column] of kinds) {
  if (!new RegExp(`column: '${column}'`).test(settings)) {
    failures.push(`"${kind}" sends mail with no row in lib/emailSettings.ts — nobody can turn ${column} off.`);
  }
}

if (failures.length) {
  console.error('Reach mail: every kind has a column, a sender, a switch, and a HIVE.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Reach mail: every kind has a column, a sender, a switch, and a HIVE.');

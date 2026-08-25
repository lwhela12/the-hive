import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meetingHelper = fs.readFileSync(path.join(root, 'app/(app)/meeting-helper.tsx'), 'utf8');
const meetings = fs.readFileSync(path.join(root, 'app/(app)/meetings.tsx'), 'utf8');
const failures = [];

// Nat, 2026-08-24, after the Room slide's ordering was quietly moved once
// (removed 2026-07-22, put back with a visible second door 2026-08-24 by a
// session she never asked): "arrivals should be the 1st page of the meeting
// helper. that is non negotiable." Every deck's slide list must open
// 'room', 'outline', 'rollcall' — count, don't just spot-check one deck.
const roomFirstCount = meetingHelper.split("slides: ['room', 'outline', 'rollcall'").length - 1;
if (roomFirstCount !== 3) {
  failures.push(`Every deck must open on the Room slide (arrivals) first — expected 3 decks, found ${roomFirstCount}.`);
}

// The Arrival Board has one door: the long-press deck-actions sheet. A
// second, visible pill on the Meetings page was added and removed once
// already (2026-07-22 removed it on purpose; 2026-08-24 it came back
// unasked). Guard the count so a third silent return fails the build
// instead of Nat's screenshot.
const arrivalBoardLinkCount = meetings.split("router.push({ pathname: '/arrival-board', params: { from: 'meetings' } })").length - 1;
if (arrivalBoardLinkCount !== 1) {
  failures.push(`Arrival Board must stay reachable through exactly one door (the long-press deck-actions sheet) — found ${arrivalBoardLinkCount} links to it in meetings.tsx.`);
}

if (failures.length) {
  console.error('Meeting arrivals: Room opens every deck, Arrival Board stays one door.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Meeting arrivals: Room opens every deck, Arrival Board stays one door.');

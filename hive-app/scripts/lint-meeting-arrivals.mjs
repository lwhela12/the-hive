import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meetingHelper = fs.readFileSync(path.join(root, 'app/(app)/meeting-helper.tsx'), 'utf8');
const meetings = fs.readFileSync(path.join(root, 'app/(app)/meetings.tsx'), 'utf8');
const arrivalSelection = fs.readFileSync(path.join(root, 'lib/arrivalSurveySelection.ts'), 'utf8');
const failures = [];

// The shared Before we meet form is where current answers are saved. An older
// HIVE-specific survey may remain active during cutover, but must not hide a
// member's new response on the Arrivals board.
const compiledSelection = ts.transpileModule(arrivalSelection, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const selectionModule = { exports: {} };
vm.runInNewContext(compiledSelection, {
  module: selectionModule,
  exports: selectionModule.exports,
});
const { selectActiveArrivalCheckIn } = selectionModule.exports;
const { getArrivalAttendance } = selectionModule.exports;
const { surveyUsesLegacyEnergy } = selectionModule.exports;
const activeSurveys = [
  { id: 'old-tech', community_id: 'tech', title: 'Monthly check-in' },
  { id: 'current-shared', community_id: null, title: 'Before we meet' },
];
const selected = selectActiveArrivalCheckIn(
  activeSurveys,
  'tech',
  (survey) => /monthly check-in|before we meet/i.test(survey.title),
);
if (selected?.id !== 'current-shared') {
  failures.push('Arrivals must prefer the shared Before we meet survey while an older HIVE survey is still active.');
}
const fallback = selectActiveArrivalCheckIn(
  activeSurveys.slice(0, 1),
  'tech',
  (survey) => /monthly check-in/i.test(survey.title),
);
if (fallback?.id !== 'old-tech') {
  failures.push('Arrivals must keep the HIVE-specific survey as a fallback when no shared check-in exists.');
}
if (getArrivalAttendance({ q_attendance: "💻 I'll be on the call" }) !== 'remote') {
  failures.push('Arrivals must recognise the current Before we meet call option as remote attendance.');
}
if (surveyUsesLegacyEnergy({ questions: [{ id: 'q_energy_level' }, { id: 'q_plate' }] })) {
  failures.push('Arrivals must hide retired energy bolts when the active form asks about plate capacity.');
}
if (!surveyUsesLegacyEnergy({ questions: [{ id: 'q_energy_level' }] })) {
  failures.push('Arrivals must keep energy bolts for a legacy form that still asks the energy question.');
}

// Nat, 2026-08-24, after the Room slide's ordering was quietly moved once
// (removed 2026-07-22, put back with a visible second door 2026-08-24 by a
// session she never asked): "arrivals should be the 1st page of the meeting
// helper. that is non negotiable." Every deck's slide list must OPEN on the
// room — read each deck's list, don't just spot-check one.
//
// This used to match the literal string `slides: ['room', 'outline',
// 'rollcall'`, which quietly made ROLL CALL non-negotiable too. It is not:
// Nat took it out of Tech's deck on 2026-09-01 because eight remote faces
// already wear their names, and the guard failed the build for obeying her.
// Arrivals first is the rule; what a deck does third is that deck's business.
const deckSlides = [...meetingHelper.matchAll(/slides: \[([^\]]*)\]/g)].map((match) =>
  match[1].split(',').map((slide) => slide.trim().replace(/^'|'$/g, ''))
);
if (deckSlides.length !== 3) {
  failures.push(`Expected 3 decks with a slide list, found ${deckSlides.length}.`);
}
deckSlides.forEach((slides, index) => {
  if (slides[0] !== 'room' || slides[1] !== 'outline') {
    failures.push(
      `Deck ${index + 1} must open on the Room slide (arrivals) then the Outline — found '${slides[0]}', '${slides[1]}'.`
    );
  }
});

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

# August 20, 2026 OG HIVE meeting reference

This is the first source-reconciled reference result for the meeting-summary
system. It is intentionally one meeting, not permission to regenerate history.

## Source record

- Meeting: `72f25bd8-bf64-497e-99a9-571da8f55674`
- HIVE: OG HIVE (`e38d99a8-3aa8-4ace-8381-e56bb9991cf9`)
- Meeting Helper: authored `news`, `appnews`, and `treasurer` notes; seven
  current-cycle check-ins; final Wrap-Up absentee selection preserved in the
  held recap record
- Duty reconciliation: 17 current non-archived duties / 79 assignment rows;
  14 routing-only placeholders excluded; archived undo/reconciliation rows stay
  preserved and do not appear as work
- Transcript: 6,103 nonblank stored lines / 321,305 characters; the evidence
  copy collapses repeated exact utterances to 2,225 lines while the original is
  unchanged
- Recording link: no `audio_url`, `assemblyai_transcript_id`, or linked event is
  present on the meeting row; the stored live transcript is available, but the
  recording cannot currently be replayed from this row

## Verified operating shape

The reader follows the Helper, in this order:

1. Roll Call
2. How We Arrived
3. News from Nat
4. Treasurer
5. Plan the Meet Ups
6. HummDinger Sesh
7. Wrap-Up
8. Needs Review, only when sources conflict

Roll Call resolves to:

- In the room: Oliver, Isabelle, Nat, Lucas, Infiniti, Brittany, Charlee
- Remote: Meghan, Nic
- Confirmed away at Wrap-Up: Sara

Confirmed meeting decisions supported by Helper plus transcript:

- Use Honey Pot funds for matching hoodies first, then save toward the Bumble
  Bee Ball.
- Move the next OG HIVE meeting to September 23 because the normal second
  Wednesday was too close / conflicted with availability.
- Keep the September HIVE Help light: pick up trash when taking a walk.
- The September 9 hang remains the saved calendar item: putting things in resin
  at Passion Vine. Transcript wording must not rename it.

## Reconciliation rules exercised by August

- Current to-do owners win for assignments. Transcript-only offers do not
  create or reassign work.
- Group fan-outs display as one duty with `OG HIVE`, not eleven flattened rows.
- The preserved `body double` duty is currently assigned to Meghan while the
  transcript asks for someone to volunteer. The summary must keep that conflict
  visible for human review rather than guessing an owner.
- Sara's confirmed absence means the overview must not say “everyone showed
  up.”
- Meghan asked for transcript attribution review; that is meeting context, not
  proof that every shared-microphone line belongs to its stored speaker label.

## Acceptance checks

- `provenance.kind` is `reconciled_helper_record`
- `provenance.transcript_used` is `true`
- `provenance.helper_structure_preserved` is `true`
- the raw transcript length remains 321,305 characters
- the previous summary remains in `rebuild_history`
- no other meeting row is rebuilt as part of this reference repair

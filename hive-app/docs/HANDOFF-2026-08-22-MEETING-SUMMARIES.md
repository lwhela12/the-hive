# HIVE handoff — meeting summaries and inline conflict review

For the next developer or Codex/Hermes session. This documents the August OG
HIVE reference repair and the inline **Needs Review** workflow completed August
21–22, 2026.

## Outcome

- The August 20 OG HIVE summary is the verified reference result. It follows
  the Meeting Helper's information architecture instead of flattening the
  meeting into raw bullets.
- The Meeting Helper snapshot and facilitator edits remain the operating
  record. Current live to-dos are authoritative for ownership. The transcript
  supplies supporting context and exposes discrepancies.
- A HIVE admin can now resolve a discrepancy inside its **Needs Review** card.
  The summary and the linked live to-do update in one database transaction.
- Production app and `origin/main` are on commit
  `0a9f66cb4e217620a83a03b1360f4663c2518152`.
- `seal-meeting` was separately deployed to Supabase project
  `cpfvnfcjhoeowdcexppi`.

## August reference record

- Meeting ID: `72f25bd8-bf64-497e-99a9-571da8f55674`
- OG HIVE ID: `e38d99a8-3aa8-4ace-8381-e56bb9991cf9`
- Raw transcript: 321,305 characters / 6,103 nonblank lines. It remains intact.
- Rebuild history: four preserved versions.
- Current unresolved review: `Body-double owner`
- Linked action item: `ab6ed8d8-881d-4e8c-bd52-61b34bb79cc4`
- Current live owner: Meghan (`438ba5db-a064-4eba-b022-8c1ba3595f9d`)
- Current state at handoff: one unresolved conflict, zero saved resolutions,
  action item open and unarchived. No decision was made for Nat during testing.

The broader reference contract and verified meeting facts live in
`docs/AUGUST_2026_OG_MEETING_REFERENCE.md`.

## What Nat sees

At the bottom of the August summary:

1. Open **Needs Review**.
2. Click **Edit this review**.
3. Choose **Keep Meghan as owner**, **Assign someone else**, or **Remove this
   duty**.
4. Optionally record what was confirmed.
5. Click **Save review**.

Reassignment requires choosing a current OG HIVE member before Save enables.
Removal archives the duty with reason
`resolved_from_meeting_summary_review`; it never deletes the audit trail.
After success the warning disappears, the visible confirmed-duty line changes
or is removed, and a server-authored receipt is appended to
`summary.conflict_resolutions`.

Do not use **Summary options → Edit wording** for this. That is the emergency
whole-recap correction path, not source reconciliation.

## Implementation map

- `components/meetings/MeetingConflictResolver.tsx`
  - Inline admin-only choice, owner picker, clarification note and save state.
- `components/meetings/MeetingSummary.tsx`
  - Produces the reviewed summary JSON, updates the exact linked duty line,
    calls the atomic RPC, reloads the meeting and to-do list, and reports the
    result.
- `components/meetings/SummarySections.tsx`
  - Carries machine-readable `group.review` metadata and renders the resolver
    inside the warning card without affecting newsletter rendering.
- `supabase/migrations/204_a_review_can_be_resolved_where_it_lives.sql`
  - Defines `public.resolve_meeting_summary_conflict(...)`.
  - Verifies signed-in HIVE-admin authority, locks the meeting and linked
    action item, validates the replacement summary did not replace the Helper
    snapshot, applies the duty change and summary together, and records the
    resolution receipt.
  - Adds only machine-readable review metadata to the existing August body-
    double conflict. It does not rewrite the transcript, summary wording,
    owner, or rebuild history.
- `supabase/functions/seal-meeting/index.ts`
  - Future transcript conflicts carry stable review IDs and exact action-item
    links when the discrepancy concerns a current duty.
  - A previously resolved stable conflict is suppressed on future rebuilds.
- `types/index.ts`
  - Adds the RPC signature to the local Supabase type contract.

## Live database/migration note

The live migration ledger is intentionally behind much of the source tree.
Do **not** run a broad `supabase db push --include-all` to reach migration 204.

Migration 204 was applied directly and exactly with `supabase db query --linked
--file ...`, verified, and then only version `204` was recorded in
`supabase_migrations.schema_migrations`. The migration is idempotent if it must
be replayed deliberately.

## Verification completed

- `npm run typecheck` — passed.
- `npm run build:web` — passed; export verification found zero missing assets.
- `git diff --check` — passed.
- Transaction-only live RPC smoke test — passed, then rolled back.
- Rollback readback — Meghan remained owner, the action stayed unarchived, and
  August remained at one unresolved conflict / zero resolutions.
- Signed-in Chrome on `app.the-hive.app` — passed:
  - **Edit this review** appears inside the August warning.
  - All eligible member choices appear.
  - Save stays disabled until a reassignment owner is selected.
  - Cancel closes the editor without changing live data.
  - No browser console errors.
- Vercel deployment `dpl_3qWzw1hQDwZjsyiG6EREHzoguFoK` reached Ready and the
  custom domain served commit `0a9f66c`.

## Guardrails for follow-up work

- Nat must make the body-double ownership decision; do not infer it from the
  transcript.
- Never mass-regenerate historical meeting summaries from this work. Establish
  each reference result against its Helper snapshot, current to-dos and
  transcript first.
- Do not discard `meeting_helper_snapshot`, `rebuild_history`, raw transcript,
  archived action items, or `conflict_resolutions`.
- If adding another resolution type, update the authoritative source in the
  same transaction. A visual-only edit that leaves the ledger stale is not a
  resolution.
- Preserve the humane Helper-shaped section hierarchy and keep transcript/raw
  evidence collapsed beneath it.

*Local handoff written August 22, 2026.*

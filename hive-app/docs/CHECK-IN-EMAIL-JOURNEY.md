# Meeting email and check-in journey

This repair continues the September 5 live rejection, from main `9af5ce3`.
The August 21 handoff and older generic-meeting-email comments are historical.

- A meeting reminder belongs to exactly one real meeting in the recipient's HIVE. Its subject, seal and name identify that HIVE. Other notification content remains generic.
- Preview reads the owner's real upcoming meeting, even before reminder day. Test and real letters use the same builder. The CTA contains an opaque event ID; after login the app checks both event access and membership. Cancelled, past and inaccessible links do not fall back into another HIVE's form.
- A source link opens that HIVE's form, keeps its identity, and returns to Meetings. A generic check-in link still offers every membership.
- The personal plate question appears once in the visible form, before HIVE questions and tasks. Existing response and occurrence storage is unchanged.
- Past answers remain stored. The shared history control starts closed and opens dates leading to the human-readable form, instead of printing internal answer keys.
- Admin's rendered email button can open the real destination through a deliberate click. Scripts and forms remain blocked in the email frame.
- Existing approval gates and daily delivery claims remain in place. This repair does not enable scheduled sends, approve an email, send a member message or fabricate a meeting.

Validation: app typecheck and interface checks; Deno typecheck of both changed handlers; full web export; offline regression suite including the real sender with two HIVEs and a member whose first HIVE is already complete. The actual database save function is exercised against an isolated PostgreSQL engine by the existing atomic test.

Live signed-in walkthrough and Nat's acceptance are separate from those checks. Record their results after deployment; never inherit an acceptance claim from this document.

## September 5 signed-in verification

On production `adc124d`, the actual Admin → Tech HIVE → Review Before we meet email rendered Tech's subject and blue seal. Clicking its real email button opened the September 8 Tech meeting's form, and closing it returned to Tech Meetings. No answers were changed or submitted and no mail was sent. The walkthrough caught a date-only timezone bug (September 8 appearing as September 7 at 5 PM); the follow-up uses the real meeting date/time, puts the plate question above context, and continues question numbering after it. Exact linked-meeting receipts also take precedence over a nearer meeting's answers.

All 16 regression scripts, interface/type checks and the full web export passed after that correction. Live verification of the final correction and Nat's acceptance remain to be recorded. Approval switches are unchanged: message, mention and board reply approved; both check-in letters pending.

## Existing wish selection

Nat accepted the email/form direction and flagged that the new-wish audience switch appeared to describe her existing HIVE-Wide wish. Existing cards now display their saved reach; selecting one hides the duplicate answer box and keeps its audience. A separate Write a new wish action opens the composer and new-wish audience switch. Existing saves only update focus, even when an older draft carries an incorrect reach. The selected wish ID/reach is retained in per-HIVE check-in receipts, and data scope is independent from shared survey branding. Offline component/save regressions cover these paths and failed reads before any wish writes.

## Finish nearby HIVEs after saving

After a successful Before we meet save, the confirmation names the saved HIVE and offers the member's other unanswered meetings in the next seven Pacific calendar days (today through six days from today). Cards show each HIVE's own seal, date and time. Continuing opens its exact meeting link, so branding, answers, drafts, wishes and receipts remain scoped to that HIVE. The existing personal plate choice carries through the session. Completed sections drop out, and their exact meeting receipts suppress subsequent day-before reminders.

Done for now uses the normal close path. Other upcoming meetings opens the complete check-in list without automatically reopening the source form. No seven-day access restriction was added; far-future and undated check-ins remain accessible. No sender schedule, approval, real member answers or meeting dates were changed.

Validation: all 18 regression scripts, interface/type checks and full web export. The new isolated journey test executes the actual screen's save/continuation callbacks and the actual confirmation component for Tuesday/Wednesday/Thursday, verifies exact receipt routing, branding, shared plate, all-list escape, and reminder suppression; it covers month/year/DST/leap boundaries. The actual modal renders the invitation only in its submitted state and closes through its own dismissal handler. A standalone rendering script is included for layout review, but browser policy blocked opening its local HTML, so no visual-acceptance claim is made from that fixture.


## One wish section (2026-09-05)

When a check-in includes the HD wish question, each wish appears there once: focus choice, existing visibility label, status controls and optional status note share one card. Wishes leave the earlier roster; other open items stay there. Forms without the HD question retain the full roster. Unavailable picker wishes still have their status notes in the wish section. Existing answer keys, focus persistence, reach and status semantics are unchanged.

Validation: typecheck and web export pass; all regression scripts pass, including grouped/flat roster placement, forms without a wish question, preserved status notes and status buttons outside the focus button. No real answers submitted or email approvals changed during verification.


## Browser annotation pass (2026-09-05)

Nat's seven annotations supersede the initial one-wish layout above. Shared plate loses its save explanation; completed-work context renders only with real completed items; its roster explanation is removed. A sole per-HIVE note heading is hidden when the form already names that HIVE, while multi-HIVE/season headings and roster placement remain.

Personal hard-out uses No/Yes and separate hour/minute/AM/PM inputs, without tags or mic. Existing No/Nope values select No. Valid old times populate the clock; unsupported old prose is retained visibly for correction. Incomplete or invalid departure times block submission. The existing q_hard_out answer stays human-readable; ArrivalMemberCard (including Meeting Helper) formats times and suppresses No/Nope labels. The meeting's official countdown continues using its separate setting.

Wish focus is a radio choice among active wishes or Write a new wish. Only the chosen wish shows audience and active/attention controls, with a note when needed. Mark granted opens the existing grant modal, preserves helper-credit and linked-board handling, and clears that wish from focus after successful granting so another/new wish can be selected. Cross-HIVE granting uses the wish's source HIVE and does not inherit another HIVE's admin role. Granting saves through its own explicit modal action; selecting focus and writing a new wish save on check-in submission. New-wish mode offers Write my own or Refine with Clive; the existing-wish privacy explanation and generic new-wish paragraphs are removed.

Validation: full typecheck/web build and all regression scripts passed. Offline tests exercise disclosure, draft preservation, grant-to-new-focus, grant cancellation, ownership/failure/credit/link behavior, clock validation and legacy/noon/midnight cases. No member check-ins or wishes were submitted/granted during agent testing; no email switches changed.


## Meeting-list annotations (2026-09-05)

Nat explicitly approved the completion page; preserve that design. On browse=all, removed the plate question from above the meeting list; it remains the first question inside each individual check-in with existing shared-draft behavior. Replaced ambiguous Anytime/Meeting soon buckets with one Upcoming meetings heading, retaining chronological groups and all future meetings. Done for now is a compact gold pill with dark text. Copy now states the day-before-or-day-of reminder limit; the sender still targets the day before and no additional send path or approval switch was changed.

Validation: typecheck, web build, check-in-priority and continuation regressions pass. Existing card review/saved state and approved success page remain intact.


## Completed work and remaining tasks (2026-09-05)

Check-ins celebrate actual unarchived completed work in “You got this done ✓”; helper contributions have a separate credit section. “Still to do” has task checkboxes, with Done moving the item into the completed section and Undo restoring it before submission. Existing notes survive both moves; attention and archive controls remain. Wish review stays in its own focus question. Empty completed panels, save explanations and repeated single-HIVE headings remain absent.

Task queries page through the full scoped list instead of silently stopping at eight open or twenty completed items. Mention-only accidental jots are excluded; archived records stay excluded. Task-load failures remain visible for the affected HIVE. Submission verifies actual completion/archive state, including silent permission failures, and retains the draft with a retry message if updates fail after answers save.

Validation: typecheck, web export, task-write/error/pagination fixtures and check-in regression suites. The approved completion screen and email approval/scheduling behavior are unchanged. User-requested personal record corrections are documented privately in the Brain receipt, not in this repository.


## Shared wish actions and meeting votes (2026-09-05)

Nat rejected Needs attention everywhere and explicitly does not want Admin to read survey answers to discover work. The retired option and its Admin-review explanation are removed from all check-in controls. Legacy flags normalize to open while retaining written notes; historical data is not erased.

An existing wish uses the same Manage Wish pencil/menu as elsewhere: Grant, Edit, Archive, Refine with Clive, and Delete. It reuses WishManageModal, AddWishModal, the grant flow and recoverable deletion. Archive verifies the owned wish in its source HIVE; failures preserve the selection. Successful grant/archive/delete clears it from the meeting choices; editing updates its text and audience display. Generic survey status chips no longer manage wishes.

Meeting Helper’s existing Plan → HIVE Meeting chart automatically shows day percentages among members who answered that question, plus the response count. Plan and Honey Pot slides now refresh responses while visible. Empty results say No votes yet; missing/invalid/outside-member votes are excluded. Arrival response month follows this HIVE’s upcoming meeting, rather than a shared survey’s earliest due date. Existing response access permissions and legacy response-period handling are retained.

Validation: typecheck and web export; check-in suites and new wish-action/vote fixtures cover retired-note preservation, owner/source scope, archive failure, vote denominators and updates. No real wish lifecycle changes, survey submission, emails or approval changes are part of testing.

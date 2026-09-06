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

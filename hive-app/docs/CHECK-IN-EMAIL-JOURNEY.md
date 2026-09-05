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

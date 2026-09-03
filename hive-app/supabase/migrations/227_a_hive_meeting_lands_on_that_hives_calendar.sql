-- A HIVE meeting belongs on that HIVE's calendar, in Nat's account.
--
-- Nat, 2026-09-03: *"we need to make the scheduling portion of the HIVE app be
-- from me, natwalstead@gmail.com. Because if we schedule a meeting in app
-- during a meeting and then people want to just click 'add to calendar' it's
-- annoying that I can't edit it after. Plus this is my baby... so we need those
-- to function the same, that I can schedule something inside the app or from my
-- Google Cal and it's one and the same."*
--
-- She was right about the cause. Every meeting the app has ever made is CREATED
-- and ORGANIZED by lucas@whelanpartners.com — checked on the real events, 3
-- Sept: Production's Sep 10 and OG's Sep 23 both come back
-- `organizer: lucas@whelanpartners.com`. They appear on Nat's calendar because
-- she is invited to them, not because they are hers, and a guest cannot edit an
-- event, move it, or own the Meet room it carries.
--
-- Two halves to fixing that, and this is the second one:
--
--   1. WHOSE ACCOUNT. `HIVE_GOOGLE_REFRESH_TOKEN` is one shared token and every
--      function writes as whoever it belongs to. Swapping it to Nat's is done
--      with `scripts/get-google-token.js` and a Supabase secret — no code.
--
--   2. WHICH CALENDAR. The functions wrote to `calendars/primary`, so even as
--      Nat every HIVE's meetings would pile into her personal calendar. She
--      keeps one calendar per HIVE already — 🐝 OG HIVE, 🤖 Tech HIVE,
--      🎪 Pro. HIVE, all owned by her — and "one and the same" means a meeting
--      made in the app lands exactly where she would have put it herself.
--
-- Left EMPTY on purpose. Blank means `primary`, which is what the functions did
-- before, so this migration changes nothing on its own. The ids go in when the
-- token is Nat's — filling them while the token is still Lucas's would point
-- the app at calendars he cannot write to and break scheduling.

alter table communities
  add column if not exists google_calendar_id text;

comment on column communities.google_calendar_id is
  'Which Google Calendar this HIVE''s meetings live on. Blank = the token owner''s primary calendar, which is what happened before there was a column. Set this and the app writes where Nat would have written by hand.';

-- The HIVE can email you when somebody speaks to you, and you can turn each
-- kind off.
--
-- Nat, 2026-09-01: *"HIVE already pushes for mentions, board replies, DMs, and
-- wish mentions. We don't have any means of pushing. It's not an app. It's a
-- web app... nobody knows any of those things. So I think an email could be
-- nice, because then people could know to go back into the HIVE web app. And
-- the usage has really fallen off."*
--
-- That is the whole reason these exist. The five notify-* functions have been
-- writing an in-app row and firing an Expo push since June; Expo push reaches
-- an installed app, and HIVE is a browser tab. So every one of those nudges
-- has been landing somewhere nobody was standing.
--
-- **Email only, deliberately.** Nat, same memo: *"the only thing we have
-- available to ourselves right now is email... When it is an app, then they
-- can toggle those on."* One switch per kind today; a push switch beside it
-- the day there is an app to push to.
--
-- Default true, not null. A missing preference read as "maybe" eventually gets
-- read as "no" by some later code path, and silently stopping somebody's mail
-- is the failure nobody notices until it matters.

alter table public.profiles
  add column if not exists email_mention_enabled boolean not null default true,
  add column if not exists email_message_enabled boolean not null default true,
  add column if not exists email_board_reply_enabled boolean not null default true;

comment on column public.profiles.email_mention_enabled is
  'Email me when somebody writes my name — on a board, in a room, or on a wish. Separate from the board switch on purpose: you may want a quiet board and still want to hear that you were named.';
comment on column public.profiles.email_message_enabled is
  'Email me when a message lands in my inbox in the app.';
comment on column public.profiles.email_board_reply_enabled is
  'Email me when somebody replies to something I posted on a board.';

-- One email per conversation, then quiet until they open it.
--
-- A back-and-forth of eleven lines would otherwise be eleven emails. This is
-- what a phone does: tell you once, go quiet, speak up again after you have
-- looked. Compared against `last_read_at` on the same row, so "have they
-- caught up" is one comparison and never a second table.
alter table public.chat_room_members
  add column if not exists email_notified_at timestamptz;

comment on column public.chat_room_members.email_notified_at is
  'When we last emailed this member about this room. Cleared in effect by them reading: we mail again only once last_read_at has caught up.';

-- A shout-out gets to say how far it travels
--
-- Wishes, posts and events all carry a setting. Replies never did — and replies
-- are where the newsletter's most personal material lives: eleven shout-outs and
-- three compliments this July, every one of them naming a person.
--
-- Until now the newsletter took all of them, because there was nothing to ask.
-- Nat's rule, 2026-08-03: "the newsletter is an opportunity to self-promote, not
-- a requirement", and "when we aren't sure, we always default to private, just
-- in case." So the column exists and defaults to 'hive': today's replies reach
-- the newsletter exactly never, and start reaching it when somebody chooses.
--
-- Note for whoever picks this up: a shout-out is usually written ABOUT someone
-- else. Nat wrote all eleven of July's. So the writer choosing 'public' is the
-- writer consenting on the named person's behalf, which is not the same thing.
-- Raised with Nat 2026-08-03 and still open — do not treat this column alone as
-- consent from the person named.

alter table public.board_replies
  add column if not exists share_scope text not null default 'hive';

alter table public.board_replies
  drop constraint if exists board_replies_share_scope_check;
alter table public.board_replies
  add constraint board_replies_share_scope_check
  check (share_scope in ('hive', 'all_hives', 'public'));

comment on column public.board_replies.share_scope is
  'How far this reply may travel. Defaults to hive, so nothing reaches the newsletter until its author says so. Still bounded by the HIVE ceiling.';

-- Everything already in the table was written when the only audience was the
-- HIVE, so it keeps that audience. Making them public retroactively would be
-- publishing words on eleven people's behalf that none of them agreed to.
update public.board_replies set share_scope = 'hive' where share_scope is null;

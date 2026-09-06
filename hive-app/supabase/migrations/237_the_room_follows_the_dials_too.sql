-- The room follows the dials, not just the slide.
--
-- Migration 182 made one person's deck everybody's deck: `slide_key` says
-- where the room is standing, and every follower lands there. That is enough
-- for a slide you read. It is not enough for a slide you *work*.
--
-- Nat, 2026-09-06, on showing the hoodies-vs-Ball numbers at the September
-- meeting: *"the absolute BEST case scenario would be if we could bring this
-- into the meeting helper & everyone had the same view as I talked through it
-- and clicked through it."* OG meets around her dining table and casts to the
-- frame TV, so the room is already looking at one screen — but Nic joins in
-- the app, in the call, following the deck. A slide with sliders on it would
-- land on Nic's screen showing Nic's numbers while Nat says "look, two hundred
-- and fifty-nine dollars left". Same slide, different answer, and the one
-- person who most needs to follow is the one who cannot.
--
-- So the session row carries the presenter's dials alongside their slide.
--
-- Shape notes:
--
-- * **One loose bag, not columns.** Every slide that ever grows a control
--   would otherwise want its own column. `slide_state` is whatever the active
--   slide says it is, keyed by slide so a stale value from another slide can
--   never be read as this one's.
--
-- * **Same rule as the slide key: unknown means ignore.** A follower on an
--   older bundle reads a key it does not recognise and simply does not move,
--   exactly as it already does for `slide_key`. Nothing here is required.
--
-- * **Still furniture.** No history, no audit. It goes away with the row when
--   the meeting ends, same as everything else in this table.
--
-- * **Presenter writes, everyone reads.** The existing policies already say
--   only the presenter may update their own row, so nothing new is needed to
--   stop a follower steering the room from the back seat.

alter table public.deck_sessions
  add column if not exists slide_state jsonb;

comment on column public.deck_sessions.slide_state is
  'The presenter''s controls for the slide they are on, keyed by slide key. Followers mirror it; an unrecognised key is ignored.';

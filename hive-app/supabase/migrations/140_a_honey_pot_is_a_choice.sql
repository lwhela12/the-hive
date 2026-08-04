-- A Honey Pot is something a HIVE decides to have, not something it is given.
--
-- Tech HIVE and Production HIVE have both been showing OG's Honey Pot screen —
-- a $0 balance, an empty ledger and a quarterly-dues line — as though they had
-- a fund that nobody had paid into. That reads as neglect. They don't have one;
-- they haven't chosen to.
--
-- Nat, 2026-08-03: "Honey pot for Tech & production should say 'not set up yet'
-- or something. Or explain potential ways it could be used or helpful... Give
-- ideas & say we have to elect a treasurer 1st and only the treasurer can take
-- money in and out & all records are here for everyone to see. Interested?
-- reach out to your admin."
--
-- Default FALSE, and OG switched on explicitly. A new HIVE starting with real
-- money switched on would be the wrong way round: money is the one thing that
-- should need somebody to say yes to it out loud.

alter table public.communities
  add column if not exists honey_pot_enabled boolean not null default false;

comment on column public.communities.honey_pot_enabled is
  'Whether this HIVE runs a Honey Pot. False shows the explainer instead of a ledger. New HIVEs start false — real money is opt-in, and needs a treasurer elected first.';

-- OG HIVE has run one since before there was more than one HIVE, with a real
-- balance and a real treasurer. Matched by slug, which is literally 'default'
-- (migration 118's public_events view hard-codes that string; renaming it
-- silently empties the public site, so it is not going to change).
update public.communities
   set honey_pot_enabled = true
 where slug = 'default';

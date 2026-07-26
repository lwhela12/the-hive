-- Who is an event for?
--
-- The HIVE has two faces: a public site anyone can follow, and members-only
-- space. Until now events lived only on the private side, so the newsletter had
-- no way to know which hangs it was allowed to name (Nat 2026-07-25). A poker
-- night at someone's house is HIVErs Only; a queer circus performance is
-- "spread the word".
--
-- Default is 'members'. Privacy defaults must be the safe direction — an event
-- becomes public because someone said so, never because nobody said otherwise.
-- That means existing events all start private and get promoted by hand, which
-- is the correct trade for not leaking a house address to the internet.

alter table public.events
  add column if not exists visibility text not null default 'members';

alter table public.events
  drop constraint if exists events_visibility_check;

alter table public.events
  add constraint events_visibility_check
  check (visibility = any (array['members', 'public']));

-- Meetings and birthdays are members-only by their nature; make that explicit
-- rather than relying on the default so a future default change can't leak them.
update public.events
set visibility = 'members'
where event_type in ('meeting', 'birthday');

comment on column public.events.visibility is
  'members = HIVErs Only; public = everyone''s invited, safe to name in the newsletter and on the public site.';

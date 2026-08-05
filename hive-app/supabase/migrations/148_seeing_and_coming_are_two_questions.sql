-- Who can SEE it, and who is INVITED, are two different questions.
--
-- Nat, 2026-08-05:
--
--   "I think the options are 2 layers, so 6 options total, is that right? 1st,
--    who's invited: This HIVE, HIVE-Wide, Public THEN Who can SEE it? The HIVE,
--    HIVE-Wide, Public. For example, we want everyone to be able to see when our
--    meetings are, (everyone HIVE wide) but i dont want everyone to be able to
--    join the meet, right?"
--
-- She is right, and the app has been quietly collapsing the two since events
-- learned to travel. `events.visibility` has been doing both jobs, so the only
-- way to let every HIVE SEE that OG meets on the 19th was to also tell every
-- HIVE they were welcome to turn up — and the Google Meet link sat right there
-- on the card. The honest options were "keep it secret" or "open the door".
--
-- So `visibility` keeps its meaning — who can see this exists — and
-- `invited_scope` is new: who it is actually for.
--
-- The rule between them is one-directional and the app has to hold it: you
-- cannot invite somebody who cannot see the thing. Invited is always the same
-- rung or narrower than visible.

alter table public.events
  add column if not exists invited_scope text;

-- Everything that exists today was written when one column meant both, so the
-- honest backfill is "invited exactly as widely as it was visible". Nothing
-- opens or closes as a result of this migration; the only change is that the
-- two can now be told apart from here on.
update public.events
   set invited_scope = visibility
 where invited_scope is null;

alter table public.events
  alter column invited_scope set default 'members',
  alter column invited_scope set not null;

-- Both columns speak the events spelling of the ladder: `members` is this HIVE.
-- Wishes say `hive` for the same rung — `normaliseScope()` in lib/scopeLook.ts
-- is where the two spellings are folded together.
alter table public.events
  drop constraint if exists events_invited_scope_valid;
alter table public.events
  add constraint events_invited_scope_valid
  check (invited_scope in ('members', 'all_hives', 'public'));

-- The rule, held by the database rather than only by the form. A form is a
-- suggestion; a constraint is the actual promise, and this one is the whole
-- point of the change: an invitation wider than the visibility would be an
-- invitation nobody could find.
alter table public.events
  drop constraint if exists events_invited_within_visible;
alter table public.events
  add constraint events_invited_within_visible
  check (
    case visibility when 'public' then 2 when 'all_hives' then 1 else 0 end
    >=
    case invited_scope when 'public' then 2 when 'all_hives' then 1 else 0 end
  );

comment on column public.events.visibility is
  'Who can see that this event exists: members | all_hives | public.';
comment on column public.events.invited_scope is
  'Who is actually invited to come, and who may see the joining details — the '
  'meet link and the address. Never wider than visibility.';

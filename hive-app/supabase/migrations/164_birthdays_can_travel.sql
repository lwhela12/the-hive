-- Birthdays get the same visibility/invited vocabulary as events
--
-- Nat, 2026-08-11: birthdays currently show to your own HIVE only, with no
-- way to change that and no way to edit them at all except your own
-- birthdate field. She wants her own birthday HIVE-Wide and public — "I
-- friggin love my bday" — and the mechanism to set that per person.
--
-- Same three levels events already use (migration 124): 'members' (this HIVE
-- only), 'all_hives' (HIVE-Wide), 'public'. Defaults to 'members' so nobody's
-- birthday travels further than their HIVE without them choosing it.

alter table public.profiles
  add column if not exists birthday_visibility text not null default 'members';
alter table public.profiles
  add column if not exists birthday_invited_scope text not null default 'members';

alter table public.profiles
  drop constraint if exists profiles_birthday_visibility_check;
alter table public.profiles
  add constraint profiles_birthday_visibility_check
  check (birthday_visibility in ('members', 'all_hives', 'public'));

alter table public.profiles
  drop constraint if exists profiles_birthday_invited_scope_check;
alter table public.profiles
  add constraint profiles_birthday_invited_scope_check
  check (birthday_invited_scope in ('members', 'all_hives', 'public'));

comment on column public.profiles.birthday_visibility is
  'How far a member''s birthday travels — mirrors events.visibility. Members always see their own HIVE-mates'' birthdays regardless.';
comment on column public.profiles.birthday_invited_scope is
  'Who counts as invited to a member''s birthday, if it ever becomes an RSVP-able thing. Mirrors events.invited_scope; never wider than birthday_visibility.';

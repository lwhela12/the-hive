-- Where your wishes and threads start out, and who gets to say
--
-- Settings split away from Profile today (Nat: "your profile is like, about you,
-- what you're working on, your 3MIQ, etc & settings is all the back end stuff").
-- One of its controls needs a column that didn't exist.
--
-- This is only a STARTING POINT. The per-item choice always wins — the picker
-- you meet when you write a wish is still the thing that decides where that wish
-- goes. This just saves the people who always want the same answer from making
-- it twelve times.
--
-- Deliberately NOT here: the per-event email switches. The reviewing agent found
-- that three of the six would have governed emails nobody sends — board replies
-- and mentions go out as push, not mail — and a fourth would have reversed a
-- decision from 2026-07-26 about the newsletter, which is still pasted into Wix
-- by hand and doesn't read anybody's preference at send time. A switch that
-- can't do anything is worse than no switch. Emails works today against the
-- columns migration 117 already added.

alter table public.profiles
  add column if not exists default_share_scope text not null default 'hive';

alter table public.profiles
  drop constraint if exists profiles_default_share_scope_check;
alter table public.profiles
  add constraint profiles_default_share_scope_check
  check (default_share_scope in ('hive', 'all_hives', 'public'));

comment on column public.profiles.default_share_scope is
  'Where a new wish or thread starts. The per-item picker always wins; this only chooses what it opens on. Defaults to hive, like everything else.';

-- The guard from migration 135 covered profile_scope alone. Everything on your
-- profile that decides reach belongs to you and to nobody above you — an admin
-- has no business choosing on your behalf that your things start out shared.
create or replace function public.guard_profile_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.profile_scope is distinct from old.profile_scope
      or new.default_share_scope is distinct from old.default_share_scope)
     and auth.uid() is not null
     and new.id <> auth.uid() then
    raise exception 'Only you decide how far your things travel.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Running a HIVE and owning the whole thing are two different jobs
--
-- "Admin" has been carrying both meanings, and that only worked while the only
-- admins were Nat and Lucas. It isn't true any more: Nic is an OG HIVE admin,
-- which today would let her draft and publish a newsletter that goes out under
-- Nat's name to the public web and to every subscriber.
--
-- So the two jobs get two names:
--
--   community admin  runs a HIVE from the inside — members, roles, the Honey
--                    Pot, that HIVE's own boards. Bounded by their HIVE.
--
--   owner            Nat and Lucas. Anything that speaks FOR the HIVE to the
--                    outside world, and anything that reads across HIVEs.
--
-- Nat's words, 2026-08-03: "Assume Nat & Lucas are the same person, same user,
-- same log in. We're the yin and the yang." So this is deliberately a pair, not
-- a single row — she often works on his login, and a rule she can lock herself
-- out of is a rule she'll end up turning off.
--
-- Nothing here takes anything away from Nic: she keeps every power she has
-- inside OG HIVE. It stops her, or any future admin of any future HIVE, from
-- publishing outward or reading sideways.

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

comment on column public.profiles.is_owner is
  'God level. Publishes outward, reads across HIVEs. Nat and Lucas only — a community admin runs their own HIVE and stops at its edge.';

update public.profiles
   set is_owner = true
 where lower(email) in ('natwalstead@gmail.com', 'lucas@whelanpartners.com');

-- Asked by policies and by the newsletter, so it lives in one place. security
-- definer + a pinned search_path: it reads profiles on behalf of the caller
-- without handing the caller anything else.
create or replace function public.is_hive_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_owner from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_hive_owner is
  'True for Nat and Lucas. Use for anything that leaves a HIVE or crosses between them.';

revoke all on function public.is_hive_owner() from public;
grant execute on function public.is_hive_owner() to authenticated;

-- A guard for the same question asked server-side, where auth.uid() is not the
-- caller: the newsletter runs with the service key, so it must ask about a
-- named person rather than about "me".
create or replace function public.is_hive_owner(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_owner from public.profiles p where p.id = uid),
    false
  );
$$;

revoke all on function public.is_hive_owner(uuid) from public;
grant execute on function public.is_hive_owner(uuid) to authenticated, service_role;

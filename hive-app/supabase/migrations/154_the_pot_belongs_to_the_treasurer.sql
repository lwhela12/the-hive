-- 154 — the pot belongs to the treasurer
--
-- Nat, on her phone 2026-08-06: "i think only the treasurer should be able to
-- 'record entry'. I know i've gone back and forth on this... we had only ollie
-- could do it, then i overrode it, because i wanted my admin to be able to do it
-- so i could do a bunch of test things."
--
-- The testing is done, and the app now shows that button to the treasurer and to
-- the two of them (`profiles.is_owner`, migration 128). This closes the door
-- behind it — an admin of a HIVE could still write to the ledger through the
-- policy and the RPC, so the button was gone and the lock was not.
--
-- `role in ('treasurer','admin')` came from migration 082, back when admin was
-- the only way anybody could get anything done. Owner did not exist yet.
--
-- Why owners stay: a brand-new HIVE has no treasurer, and a pot nobody can
-- update is worse than one too many people can. It also matches every other
-- "speaks for a HIVE" check in the app, which asks is_owner and not admin.
--
-- The global `profiles.role` check is dropped along with it. Roles live on the
-- membership row, per HIVE — reading a global column meant a treasurer of one
-- HIVE could write to another HIVE's ledger.
create or replace function public.is_community_treasurer(c_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select
    public.is_hive_owner()
    or exists (
      select 1
      from public.community_memberships cm
      where cm.community_id = c_id
        and cm.user_id = auth.uid()
        and cm.role::text = 'treasurer'
    );
$function$;

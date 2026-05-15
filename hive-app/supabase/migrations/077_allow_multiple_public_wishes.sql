-- Allow members to keep multiple open public wishes.
-- The old trigger marked previous public wishes as "replaced", which hid them
-- from Community Wishes whenever a member added a new public wish.

drop trigger if exists ensure_single_active_wish on public.wishes;
drop function if exists public.check_active_wish();

update public.wishes
set
  status = 'public',
  is_active = true,
  replaced_at = null
where status = 'replaced'
  and replaced_at is not null
  and fulfilled_at is null;

update public.wishes
set is_active = true
where status = 'public'
  and is_active = false
  and fulfilled_at is null;

comment on column public.wishes.is_active is
  'Whether this wish is currently visible in open wish lists. Multiple public wishes per member are allowed.';

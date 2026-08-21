-- A deleted wish can come back.
--
-- Deleting a wish was a real SQL DELETE, and `wish_comments` and
-- `wish_granters` both hang off it with `on delete cascade`. So "delete" did
-- not remove a wish; it removed the wish, the whole conversation underneath
-- it, and the record of who had offered to help. Lucas deleted one by
-- accident and there was nothing to press (Nat, 2026-08-21).
--
-- Two halves to the fix, and the second is the one that matters:
--
-- 1. The row stays. `deleted_at` marks it instead.
-- 2. **The read policy hides it, not the queries.** There are 48 places in the
--    app that select from `wishes`, plus embedded reads like
--    `wish:wishes(...)` inside other queries. Asking all of them to remember a
--    filter is asking for the one that forgets, and the symptom of forgetting
--    is a deleted wish reappearing on someone's screen — worse than the bug
--    being fixed. The rule lives in the row-level policy, so a query cannot
--    opt out of it and a new query written next month inherits it.
--
-- Edge functions run as the service role and bypass policies, so those are
-- filtered by hand, one file at a time.

alter table public.wishes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

comment on column public.wishes.deleted_at is
  'When this wish was taken off the lists. The row, its comments and its granters all stay. Null means live.';
comment on column public.wishes.deleted_by is
  'Who took it off the lists — kept so a restore can say who removed it.';

-- Reading past deleted rows is only ever the restore path, and that goes
-- through the functions below.
create index if not exists wishes_live_by_community_idx
  on public.wishes (community_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- The read rule, in one line that nothing can talk its way around
-- ---------------------------------------------------------------------------
-- `wishes` has TWO permissive select policies -- "Wishes viewable by scope"
-- and "Fulfilled wishes viewable by scope" -- and permissive policies are
-- OR'd. Editing one and not the other would have hidden most deleted wishes
-- while quietly leaving every fulfilled one on the screen, which is the exact
-- half-fix this design is trying to make impossible.
--
-- A RESTRICTIVE policy is AND'd with all of them instead. It cannot be
-- out-voted by a permissive policy, and a third policy added next year is
-- covered the day it is written without anyone remembering this one exists.
drop policy if exists "A deleted wish is not readable" on public.wishes;
create policy "A deleted wish is not readable" on public.wishes
  as restrictive
  for select
  using (deleted_at is null);

-- And nothing may be written to one while it sits in the bin -- no reactions,
-- no status change, no quiet edit that a restore would then bring back wearing
-- the wrong words. Both functions below are security definer, so the restore
-- path is not caught by this.
drop policy if exists "A deleted wish is not writable" on public.wishes;
create policy "A deleted wish is not writable" on public.wishes
  as restrictive
  for update
  using (deleted_at is null);

-- ---------------------------------------------------------------------------
-- Taking one off the lists, and putting it back
-- ---------------------------------------------------------------------------
-- Both are security definer because the row is invisible to a normal select
-- the moment it is marked, so the caller cannot read back what it just did and
-- cannot find it again to restore it. Each one re-checks permission itself
-- rather than trusting the caller: you may remove or restore your own wish,
-- and an admin may do it for anyone in the HIVE they run.

create or replace function public.soft_delete_wish(p_wish_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_community uuid;
begin
  select user_id, community_id into v_owner, v_community
  from public.wishes
  where id = p_wish_id and deleted_at is null;

  if v_owner is null then
    return null;
  end if;

  if auth.uid() <> v_owner and not public.is_community_admin(v_community) then
    raise exception 'Not allowed to remove this wish';
  end if;

  update public.wishes
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_wish_id;

  return p_wish_id;
end;
$$;

create or replace function public.restore_wish(p_wish_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_community uuid;
begin
  select user_id, community_id into v_owner, v_community
  from public.wishes
  where id = p_wish_id and deleted_at is not null;

  if v_owner is null then
    return null;
  end if;

  if auth.uid() <> v_owner and not public.is_community_admin(v_community) then
    raise exception 'Not allowed to restore this wish';
  end if;

  update public.wishes
  set deleted_at = null, deleted_by = null
  where id = p_wish_id;

  return p_wish_id;
end;
$$;

-- What is sitting in the bin, for the people allowed to reach into it.
create or replace function public.deleted_wishes(p_community_id uuid)
returns table (
  id uuid,
  user_id uuid,
  owner_name text,
  title text,
  description text,
  status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_name text,
  comment_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    w.id,
    w.user_id,
    owner.name,
    w.title,
    w.description,
    w.status::text,
    w.deleted_at,
    w.deleted_by,
    remover.name,
    (select count(*) from public.wish_comments c where c.wish_id = w.id)
  from public.wishes w
  left join public.profiles owner on owner.id = w.user_id
  left join public.profiles remover on remover.id = w.deleted_by
  where w.community_id = p_community_id
    and w.deleted_at is not null
    and (auth.uid() = w.user_id or public.is_community_admin(p_community_id))
  order by w.deleted_at desc;
$$;

grant execute on function public.soft_delete_wish(uuid) to authenticated;
grant execute on function public.restore_wish(uuid) to authenticated;
grant execute on function public.deleted_wishes(uuid) to authenticated;

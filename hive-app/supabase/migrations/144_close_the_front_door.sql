-- Four holes, found by an audit on 2026-08-04. Three were proven against the
-- live database with nothing but the public anon key that ships inside the app.
--
-- The theme: every one of these is a guard that WAS written, correctly, and then
-- left with a gap beside it. Migration 130 blocked privilege escalation on
-- UPDATE and not INSERT. The 2026-08-03 pass hardened three SECURITY DEFINER
-- RPCs and missed two. The three `notify-*-mention` functions verify their
-- caller and their two siblings never did. Nothing here is a design mistake —
-- it is all the same failure to finish a sweep.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CRITICAL: anybody could sign themselves in as owner of the whole app.
--
-- The profile row is made BY THE CLIENT (there is no trigger on auth.users —
-- `app/_layout.tsx` inserts it after login), and the insert policy is only
-- `auth.uid() = id`. It says nothing about which COLUMNS may be set.
--
-- Migration 130 added `guard_profile_privileges` to stop somebody granting
-- themselves `is_owner` or `role = 'admin'` — but declared it `before update`.
-- So the door it locked was the one you use on your second visit. On your
-- first, you write the row yourself, with whatever is in it.
--
-- `is_hive_owner()` reads `profiles.is_owner` directly, and `is_community_admin()`
-- returns true whenever `is_hive_owner()` does. Sign-ups are open to the
-- internet. So: register, insert your own profile with `is_owner: true`, add
-- yourself to every HIVE through the admin membership policy, and read, edit or
-- delete anything in the app — including everybody's private feedback.
--
-- Existing members cannot re-run it (their row exists, and there is no delete
-- policy on profiles), so the exposure is every NEW sign-up. Which is precisely
-- what TestFlight is for.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_owner boolean;
begin
  select coalesce(p.is_owner, false) into actor_is_owner
  from public.profiles p
  where p.id = auth.uid();

  if tg_op = 'INSERT' then
    -- Nobody arrives privileged. A real owner is promoted afterwards, by an
    -- existing owner, through the update path below.
    if coalesce(new.is_owner, false) and not coalesce(actor_is_owner, false) then
      new.is_owner := false;
    end if;
    if new.role is distinct from 'member' and not coalesce(actor_is_owner, false) then
      new.role := 'member';
    end if;
    return new;
  end if;

  if new.is_owner is distinct from old.is_owner and not coalesce(actor_is_owner, false) then
    raise exception 'Only an owner can change who owns the HIVE.';
  end if;
  if new.role is distinct from old.role and not coalesce(actor_is_owner, false) then
    raise exception 'You cannot change your own role.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Belt as well as braces: even with the trigger, the column should not default
-- to something dangerous.
alter table public.profiles alter column is_owner set default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CRITICAL: an anonymous stranger could dump member names and emails.
--
-- `get_queen_bees_with_highlights` is SECURITY DEFINER with EXECUTE granted to
-- `anon`, and contains no auth check at all — no auth.uid(), no membership
-- test. It joins queen_bees to profiles and returns `p.email`. The audit ran it
-- with only the anon key (which ships inside the app bundle and the web JS) and
-- got back real names, real email addresses and project details. It takes a
-- community id as an argument, so it reads every HIVE.
--
-- `ensure_member_hd_board` is the same shape and worse: no auth check, and it
-- upserts `board_categories` with `on conflict (community_id, name) do update
-- set owner_user_id = excluded.owner_user_id`. Board names come from a member's
-- own display name, which a member can change freely. Rename yourself to match
-- somebody else, call it, take the conflict branch, and their HD board is now
-- yours to edit and delete.
--
-- Neither is called by anything in the app — Queen Bee has been dead for weeks,
-- and HD boards are made by the `auto_create_member_hd_board` trigger. So the
-- honest fix is not to add a guard to an unused function; it is to delete it.
-- A dead function with EXECUTE granted to anon is a hole with nothing on the
-- other side of it worth keeping.
-- The signature is (uuid, text[]) — the months are passed as an array of
-- 'YYYY-MM' strings, not a count. Guessing it as (uuid, integer) is why the
-- first attempt at this drop silently did nothing: `drop function if exists`
-- with the wrong argument types is a no-op, not an error.
drop function if exists public.get_queen_bees_with_highlights(uuid, text[]);

revoke execute on function public.ensure_member_hd_board(uuid, uuid) from anon;
revoke execute on function public.ensure_member_hd_board(uuid, uuid) from public;

-- And it must not be able to steal a board even when a signed-in member calls
-- it. Reassigning an existing board's owner was never the point of this
-- function; making a missing one was.
create or replace function public.ensure_member_hd_board(c_id uuid, member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  board_id uuid;
  board_name text;
begin
  -- You may only ever do this for yourself, in a HIVE you are actually in.
  if auth.uid() is null or auth.uid() <> member_id then
    raise exception 'You can only set up your own HD board.';
  end if;
  if not public.is_community_member(c_id) then
    raise exception 'You are not a member of that HIVE.';
  end if;

  select public.hive_hd_display_name(p.name) into board_name
  from public.profiles p where p.id = member_id;

  if board_name is null then
    return null;
  end if;

  select bc.id into board_id
  from public.board_categories bc
  where bc.community_id = c_id and bc.name = board_name;

  -- Already there. Hand back what exists and touch NOTHING — the old version's
  -- `do update set owner_user_id = excluded.owner_user_id` is the whole exploit.
  if board_id is not null then
    return board_id;
  end if;

  insert into public.board_categories (community_id, name, owner_user_id, topic_kind)
  values (c_id, board_name, member_id, 'hd_board')
  returning id into board_id;

  return board_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. HIGH: a post could still out-reach the board it sits on.
--
-- This is the rule that has now been learned three times — twice in one evening
-- on 2026-08-03 — and it has never actually been enforced anywhere. The select
-- policy on board_posts checks the POST's visibility and the HIVE's ceiling, and
-- never once looks at `board_categories.reach`. So a member can post into a
-- private board — an HD board, Compliment Corner, somebody's own board — with
-- `visibility = 'all_hives'`, and every member of every HIVE can read it.
--
-- A comment cannot enforce a rule. A trigger can.
--
-- It caps ONLY `all_hives`, and deliberately leaves `public` alone. Writing the
-- obvious version — "a hive board may hold neither all_hives nor public" —
-- would have emptied the public newsletter archive on the-hive.app: the
-- `public_newsletters` view reads `visibility = 'public'` posts sitting on the
-- HIVE Newsletter board, whose reach is `hive`. Six live newsletters and one
-- HIVE Helpers post are exactly that shape, on purpose.
--
-- `public` is a different axis and already has its own guard:
-- `guard_post_visibility` (migration 126) restricts it to `is_hive_owner()`, and
-- the view checks `communities.max_share_scope` on top. The unguarded axis — the
-- one that lets an ordinary member push a post out of their own HIVE and into
-- everybody else's — is `all_hives`, and that is what this closes.
create or replace function public.cap_post_visibility_at_board_reach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  board_reach text;
begin
  select bc.reach into board_reach
  from public.board_categories bc
  where bc.id = new.category_id;

  -- A board that stays in its HIVE cannot hold a post that travels to others.
  if board_reach = 'hive' and new.visibility = 'all_hives' then
    new.visibility := 'members';
  end if;

  return new;
end;
$$;

drop trigger if exists cap_post_visibility_at_board_reach on public.board_posts;
create trigger cap_post_visibility_at_board_reach
  before insert or update on public.board_posts
  for each row execute function public.cap_post_visibility_at_board_reach();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MEDIUM: anyone with the anon key could write notifications for anybody.
--
-- `notifications` had `with check (true)` on insert, with the grant reaching
-- `anon`. Reads are correctly scoped to the recipient, so this is spoofing
-- rather than disclosure — but a forged in-app notification carrying a real
-- member's name is a convincing thing to receive.
--
-- Edge functions use the service role, which bypasses RLS, so tightening this
-- costs them nothing.
drop policy if exists "System can create notifications" on public.notifications;
create policy "Only the app itself creates notifications"
  on public.notifications for insert
  with check (false);

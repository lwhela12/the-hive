-- ============================================================================
-- 193 — the garden follows the switch
-- ============================================================================
--
-- Nat, 2026-08-19, voice memo: "because I'm in my Production HIVE and I have
-- toggled on visible HIVE-Wide, that means that my skills garden that I've
-- already done in OG HIVE should also already be visible here... I don't have
-- to go through and set each one up differently."
--
-- Migration 190 let a skill row travel through its own `reach` column, and
-- then nothing in the app ever wrote that column — the control was built and
-- never rendered, so all 276 flowers sat at 'hive' and no garden travelled,
-- ever. That is the gap between "the switch is on" and "Production still
-- shows me an empty garden".
--
-- The fix removes the second flag instead of wiring it up. One switch decides
-- the whole card (Nat's own simplification, 2026-08-19), so the read policy
-- asks the switch directly: a person whose `profile_scope` is 'all_hives' has
-- said their whole card travels, and their garden is part of their card.
-- There is nothing to keep in sync and no second toggle to forget when a new
-- flower is planted.
--
-- `profile_travels()` is security definer for the same reason
-- `is_community_member()` is: a policy subquery runs under the caller's own
-- row-level security, and whether a viewer may read someone's profile row is
-- a different question from whether that person's card travels.
--
-- The owning HIVE's ceiling still applies (`community_shares_beyond_hive`),
-- exactly as it does for wishes: a HIVE whose ceiling is 'hive' keeps its
-- flowers home whatever the owner's switch says.
--
-- `skills.reach` stays where it is, unwritten and unread — the same retirement
-- `profiles.piece_reach` got in the same simplification.

create or replace function public.profile_travels(person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = person and profile_scope = 'all_hives'
  );
$$;

comment on function public.profile_travels(uuid) is
  'True when this person''s whole card is set Visible HIVE-Wide (profiles.profile_scope = all_hives). Security definer so row policies can ask it about people whose profile row the viewer cannot read directly.';

drop policy if exists "Skills viewable by scope" on public.skills;

create policy "Skills viewable by scope" on public.skills
  for select using (
    auth.uid() = user_id
    or is_community_member(community_id)
    or (
      profile_travels(user_id)
      and community_shares_beyond_hive(community_id)
      and is_any_community_member()
    )
  );

-- The partial index from 190 served the reach clause this policy no longer has.
drop index if exists public.skills_travelling_idx;

comment on column public.skills.reach is
  'Vestigial since migration 193. Whether a garden travels is decided by the owner''s profiles.profile_scope — one switch for the whole card — not per row. Kept because dropping a column is a bigger decision than ignoring one.';

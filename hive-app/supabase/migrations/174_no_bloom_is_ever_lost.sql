-- No bloom is ever lost
--
-- Charlee's skills garden was bulk-wiped once and there was no way back:
-- every flower's place and growth gone, nothing anywhere that remembered
-- what it had looked like. The app has two ways that can happen, and until
-- today neither left a trace:
--
--   1. "Plant Fresh Garden" (SkillBubbleGarden's replace mode) runs one
--      UPDATE that sets enthusiasm_level = 0 and display_x/display_y = null
--      on EVERY skill the member has in that HIVE. The rows survive; the
--      garden is gone. The component's own comment says this is very
--      probably what members meant by "my skills were deleted"
--      (Nat 2026-07-26) — this is the wipe Charlee most likely hit.
--   2. Real DELETEs: removing a skill on the profile page, or an admin
--      editing a member's skill list on the Members page, which deletes
--      every deselected skill in one call.
--
-- So: a graveyard table, and two triggers that copy a bloom into it at the
-- moment it would otherwise be lost — one for rows that are deleted, one
-- for rows that survive but have their placement cleared. Restoring is a
-- chat request to Nat or Lucas, on purpose; there is no app UI for this.
--
-- Live shape checked 2026-08-12 before writing (per the standing gotcha):
-- skills has id, user_id, community_id, description, raw_input,
-- extracted_from (enum extraction_source, default 'chat'), enthusiasm_level
-- (integer, not null, default 0), display_x numeric, display_y numeric,
-- created_at. 258 rows, 83 of them placed. The only existing trigger on
-- skills is pin_the_hive (BEFORE UPDATE); it returns NEW and coexists
-- fine with these.

-- ── The graveyard ────────────────────────────────────────────────────────────

create table if not exists public.skills_graveyard (
  id uuid primary key default gen_random_uuid(),
  -- Everything the skills row was, at the moment it was lost.
  skill_id uuid not null,
  user_id uuid not null,
  community_id uuid not null,
  description text not null,
  raw_input text,
  extracted_from extraction_source,
  enthusiasm_level integer not null default 0,
  display_x numeric,
  display_y numeric,
  skill_created_at timestamptz,
  -- How it was lost. 'deleted': the row itself is gone, restore by
  -- re-inserting. 'unplanted': the row survives with its placement cleared,
  -- restore by updating it back.
  lost_how text not null check (lost_how in ('deleted', 'unplanted')),
  -- Who did it — auth.uid() when a signed-in person did, null when the
  -- service role did (repair tools, cascades).
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);

comment on table public.skills_graveyard is
  'Every skills-garden bloom that was deleted or unplanted, kept so a wiped garden can be restored (migration 174 — Charlee''s was wiped once, unrecoverably). Written only by triggers on skills; read only by owners; restoring is a chat request, not an app feature.';

comment on column public.skills_graveyard.lost_how is
  '''deleted'' = the skills row is gone, restore by re-inserting it. ''unplanted'' = the row survives but its placement was cleared (the "Plant Fresh Garden" reset), restore by updating placement back onto it.';

-- Restores look up one member's wipe by when it happened.
create index if not exists skills_graveyard_user_lost_idx
  on public.skills_graveyard (user_id, deleted_at desc);

-- ── The remembering ──────────────────────────────────────────────────────────

-- One function for both triggers. A plain insert: if the graveyard ever
-- refuses a row, the delete or reset fails with it, atomically — losing a
-- garden silently is the exact failure this migration exists to end.
create or replace function public.remember_the_bloom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.skills_graveyard (
    skill_id, user_id, community_id, description, raw_input, extracted_from,
    enthusiasm_level, display_x, display_y, skill_created_at,
    lost_how, deleted_by
  ) values (
    old.id, old.user_id, old.community_id, old.description, old.raw_input,
    old.extracted_from, old.enthusiasm_level, old.display_x, old.display_y,
    old.created_at,
    case when tg_op = 'DELETE' then 'deleted' else 'unplanted' end,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.remember_the_bloom is
  'Copies a skills row into skills_graveyard at the moment it is deleted or unplanted (migration 174). Security definer so the copy lands whoever is doing the deleting.';

-- Only triggers call this; nobody calls it by hand.
revoke all on function public.remember_the_bloom() from public, anon, authenticated;

-- A bloom that is deleted is remembered.
drop trigger if exists every_deleted_bloom_is_remembered on public.skills;
create trigger every_deleted_bloom_is_remembered
  before delete on public.skills
  for each row
  execute function public.remember_the_bloom();

-- A bloom that survives but loses its place is remembered too. This is the
-- "Plant Fresh Garden" shape: placed before, unplaced after. An ordinary
-- move (new coordinates), watering (level up), or editing an unplanted seed
-- never fires it.
drop trigger if exists every_unplanted_bloom_is_remembered on public.skills;
create trigger every_unplanted_bloom_is_remembered
  before update on public.skills
  for each row
  when (
    (old.enthusiasm_level > 0
      or old.display_x is not null
      or old.display_y is not null)
    and new.enthusiasm_level = 0
    and new.display_x is null
    and new.display_y is null
  )
  execute function public.remember_the_bloom();

-- ── Who may look ─────────────────────────────────────────────────────────────

alter table public.skills_graveyard enable row level security;

-- Owners read; nobody else sees it exists. Nobody writes through the API at
-- all — the triggers write as definer, and the service role (which bypasses
-- policies) is the restore path.
drop policy if exists "Owners can read the graveyard" on public.skills_graveyard;
create policy "Owners can read the graveyard"
  on public.skills_graveyard
  for select
  using (public.is_hive_owner());

-- Supabase grants table access to anon and authenticated by default; the
-- graveyard takes it back. authenticated keeps SELECT so the owner policy
-- has something to gate.
revoke all on table public.skills_graveyard from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.skills_graveyard from authenticated;

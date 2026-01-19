-- Migration 048: Fix monthly_highlights RLS policies and schema
-- The monthly_highlights table was missing INSERT/UPDATE/DELETE policies,
-- and meeting_id was NOT NULL which prevented manual highlights from the UI.

-- Make meeting_id nullable so users can add highlights manually without a meeting
alter table public.monthly_highlights
  alter column meeting_id drop not null;

-- Add column to track who created the highlight (for manual ones)
alter table public.monthly_highlights
  add column if not exists created_by uuid references auth.users(id);

-- Add INSERT policy for community members
create policy "Community members can insert highlights"
  on public.monthly_highlights
  for insert
  with check (public.is_community_member(community_id));

-- Add UPDATE policy for community members
create policy "Community members can update highlights"
  on public.monthly_highlights
  for update
  using (public.is_community_member(community_id));

-- Add DELETE policy for community members
create policy "Community members can delete highlights"
  on public.monthly_highlights
  for delete
  using (public.is_community_member(community_id));

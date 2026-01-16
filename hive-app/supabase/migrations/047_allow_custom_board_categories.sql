-- Migration: 047_allow_custom_board_categories.sql
-- Allow members to create custom board categories without requiring admin approval

-- Drop the existing restrictive policy for member category suggestions
drop policy if exists "Members can suggest categories" on public.board_categories;

-- Add a new policy that allows members to create custom categories directly
-- Custom categories don't require approval and are immediately available
create policy "Members can create custom categories" on public.board_categories
  for insert with check (
    exists (
      select 1 from public.community_memberships
      where community_id = board_categories.community_id and user_id = auth.uid()
    )
    and category_type = 'custom'
    and is_system = false
    and requires_admin = false
    and created_by = auth.uid()
  );

-- Allow members to update their own custom categories (name, description, icon)
create policy "Members can update own custom categories" on public.board_categories
  for update using (
    created_by = auth.uid()
    and category_type = 'custom'
    and is_system = false
  )
  with check (
    created_by = auth.uid()
    and category_type = 'custom'
    and is_system = false
  );

-- Allow members to delete their own custom categories (if empty)
create policy "Members can delete own custom categories" on public.board_categories
  for delete using (
    created_by = auth.uid()
    and category_type = 'custom'
    and is_system = false
    and not exists (
      select 1 from public.board_posts
      where category_id = board_categories.id
    )
  );

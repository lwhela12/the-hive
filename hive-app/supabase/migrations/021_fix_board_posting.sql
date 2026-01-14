-- Migration: 014_fix_board_posting.sql
-- Ensures all community members can post on the message board

-- Drop existing insert policies for board_posts
drop policy if exists "Members can create posts in non-admin categories" on public.board_posts;
drop policy if exists "Admins can post in any category" on public.board_posts;

-- Recreate with simpler, clearer policies
-- Members can post in non-admin categories
create policy "Members can create posts" on public.board_posts
  for insert with check (
    -- Must be the author
    auth.uid() = author_id
    -- Must be a member of this community
    and exists (
      select 1 from public.community_memberships
      where community_id = board_posts.community_id
        and user_id = auth.uid()
    )
    -- Category must not require admin (or user must be admin)
    and (
      not exists (
        select 1 from public.board_categories
        where id = board_posts.category_id and requires_admin = true
      )
      or exists (
        select 1 from public.community_memberships
        where community_id = board_posts.community_id
          and user_id = auth.uid()
          and role = 'admin'
      )
    )
  );

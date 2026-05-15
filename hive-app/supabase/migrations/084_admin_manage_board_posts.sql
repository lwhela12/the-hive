-- Admins can clean up or archive old board threads across all boards.

drop policy if exists "Community admins can update board posts" on public.board_posts;
create policy "Community admins can update board posts" on public.board_posts
  for update using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

drop policy if exists "Community admins can delete board posts" on public.board_posts;
create policy "Community admins can delete board posts" on public.board_posts
  for delete using (public.is_community_admin(community_id));

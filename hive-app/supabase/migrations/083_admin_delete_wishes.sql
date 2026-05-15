-- Admins can clean up accidental or test wishes for community members.

drop policy if exists "Admins can delete wishes" on public.wishes;

create policy "Admins can delete wishes" on public.wishes
  for delete using (public.is_community_admin(community_id));

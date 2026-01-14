-- Add delete policy for community_invites so admins can revoke invites
create policy "Admins can delete invites" on public.community_invites
  for delete using (public.is_community_admin(community_id));

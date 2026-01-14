-- Allow users to view invites sent to their own email address
-- This is needed so new users can see and accept their pending invites
create policy "Users can view own invites" on public.community_invites
  for select using (lower(email) = lower(auth.email()));

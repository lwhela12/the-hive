-- Allow users to delete their own invites (for cleanup after acceptance)
CREATE POLICY "Users can delete own invites" ON public.community_invites
  FOR DELETE USING (lower(email) = lower(auth.email()));

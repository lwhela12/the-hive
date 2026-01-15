-- Allow users with pending invites to view the community they're invited to
-- This fixes the join issue when checking invites

CREATE OR REPLACE FUNCTION public.has_pending_invite(community_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_invites
    WHERE community_id = community_uuid
      AND lower(email) = lower(auth.email())
      AND accepted_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Update communities policy to allow invited users to see the community
DROP POLICY IF EXISTS "Communities viewable by members" ON public.communities;
CREATE POLICY "Communities viewable by members or invitees" ON public.communities
  FOR SELECT USING (
    public.is_community_member(id)
    OR public.is_genesis_state()
    OR public.has_pending_invite(id)
  );

-- Fix: The NOT EXISTS check in RLS policies causes infinite recursion
-- Solution: Use a SECURITY DEFINER function to bypass RLS for the genesis check

-- Create a function that checks if any memberships exist (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_genesis_state()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.community_memberships LIMIT 1);
$$;

-- Revert the broken policies and use the new function instead

-- Fix community_memberships SELECT policy
DROP POLICY IF EXISTS "Members can view memberships" ON public.community_memberships;
CREATE POLICY "Members can view memberships" ON public.community_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_community_member(community_id)
    OR public.is_genesis_state()
  );

-- Fix community_memberships INSERT policy for genesis
DROP POLICY IF EXISTS "Genesis user can bootstrap community" ON public.community_memberships;
CREATE POLICY "Genesis user can bootstrap community" ON public.community_memberships
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_genesis_state()
  );

-- Fix communities SELECT policy
DROP POLICY IF EXISTS "Communities viewable by members" ON public.communities;
CREATE POLICY "Communities viewable by members" ON public.communities
  FOR SELECT USING (
    public.is_community_member(id)
    OR public.is_genesis_state()
  );

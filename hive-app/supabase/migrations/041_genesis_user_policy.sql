-- Allow first user (genesis) to bootstrap the community
-- This policy allows an authenticated user to create a membership for themselves
-- when NO memberships exist in the system yet (genesis case)

create policy "Genesis user can bootstrap community" on public.community_memberships
  for insert with check (
    auth.uid() = user_id
    AND NOT EXISTS (
      select 1 from public.community_memberships limit 1
    )
  );

-- Also need to allow genesis user to read memberships to check if any exist
-- Update the select policy to allow count queries for genesis check
drop policy if exists "Members can view memberships" on public.community_memberships;
create policy "Members can view memberships" on public.community_memberships
  for select using (
    user_id = auth.uid()
    OR public.is_community_member(community_id)
    -- Allow anyone to check if memberships exist (for genesis detection)
    -- This only reveals existence, not data
    OR NOT EXISTS (select 1 from public.community_memberships limit 1)
  );

-- Allow genesis user to view communities when bootstrapping
-- (they need to find the default community before becoming a member)
drop policy if exists "Communities viewable by members" on public.communities;
create policy "Communities viewable by members" on public.communities
  for select using (
    public.is_community_member(id)
    -- Genesis case: if no memberships exist, allow viewing communities
    OR NOT EXISTS (select 1 from public.community_memberships limit 1)
  );

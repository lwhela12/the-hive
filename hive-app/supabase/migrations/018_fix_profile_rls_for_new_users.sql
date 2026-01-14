-- Fix profile RLS to allow new users to read and create their own profile
-- Currently, the SELECT policy requires community membership, which blocks new users

-- Drop the existing overly restrictive SELECT policy
drop policy if exists "Profiles viewable by community members" on public.profiles;

-- Create a new SELECT policy that allows:
-- 1. Users to always read their own profile
-- 2. Users to read profiles of members in shared communities
create policy "Users can view own profile and community members" on public.profiles
  for select using (
    auth.uid() = id
    OR exists (
      select 1 from public.community_memberships cm
      where cm.user_id = profiles.id
        and cm.community_id in (
          select community_id from public.community_memberships
          where user_id = auth.uid()
        )
    )
  );

-- Ensure INSERT policy exists and works for new users
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

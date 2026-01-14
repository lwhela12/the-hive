-- Fix community_memberships RLS to allow users to join via invite
-- Currently only admins can insert memberships, but users accepting invites need to create their own

-- Allow users to view their own memberships (needed to check if they're already a member)
drop policy if exists "Members can view memberships" on public.community_memberships;
create policy "Members can view memberships" on public.community_memberships
  for select using (
    user_id = auth.uid()
    OR public.is_community_member(community_id)
  );

-- Allow users to insert their own membership if they have a valid, unexpired invite
drop policy if exists "Admins can add members" on public.community_memberships;

-- Admins can still add any member
create policy "Admins can add members" on public.community_memberships
  for insert with check (public.is_community_admin(community_id));

-- Users can add themselves if they have a valid invite
create policy "Users can join via invite" on public.community_memberships
  for insert with check (
    auth.uid() = user_id
    AND exists (
      select 1 from public.community_invites
      where community_invites.community_id = community_memberships.community_id
        AND lower(community_invites.email) = lower(auth.email())
        AND community_invites.accepted_at IS NULL
        AND (community_invites.expires_at IS NULL OR community_invites.expires_at > now())
    )
  );

-- Also allow users to update invite's accepted_at when they accept
drop policy if exists "Admins can update invites" on public.community_invites;
create policy "Admins can update invites" on public.community_invites
  for update using (public.is_community_admin(community_id));

create policy "Users can accept own invites" on public.community_invites
  for update using (lower(email) = lower(auth.email()))
  with check (lower(email) = lower(auth.email()));

-- Migration: Allow all community members to create events (not just admins)
-- This moves event creation from admin-only to all members

-- Drop the existing admin-only insert policy
DROP POLICY IF EXISTS "Admins can insert events" ON public.events;

-- Create new policy allowing all community members to insert events
CREATE POLICY "Members can insert events" ON public.events
  FOR INSERT WITH CHECK (public.is_community_member(community_id));

-- Optionally, also allow members to update/delete their own events
-- (keeping admin ability to update/delete all events)

-- Drop existing update policy
DROP POLICY IF EXISTS "Admins can update events" ON public.events;

-- Create policy allowing members to update their own events OR admins to update any
CREATE POLICY "Members can update own events or admins can update all" ON public.events
  FOR UPDATE USING (
    created_by = auth.uid() OR public.is_community_admin(community_id)
  );

-- Drop existing delete policy
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;

-- Create policy allowing members to delete their own events OR admins to delete any
CREATE POLICY "Members can delete own events or admins can delete all" ON public.events
  FOR DELETE USING (
    created_by = auth.uid() OR public.is_community_admin(community_id)
  );

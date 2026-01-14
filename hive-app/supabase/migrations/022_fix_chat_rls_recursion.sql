-- Fix circular RLS dependency between chat_rooms and chat_room_members
--
-- The problem:
-- - chat_rooms SELECT policy checks chat_room_members (to see if user is a member)
-- - chat_room_members SELECT policy checks chat_rooms (to verify community)
-- - This creates infinite recursion → 500 errors
--
-- The solution:
-- Replace the chat_room_members policy with one that doesn't join to chat_rooms.
-- Instead, use a SECURITY DEFINER function to check community membership.

-- First, create a helper function that bypasses RLS
create or replace function is_community_member_for_room(p_room_id uuid)
returns boolean as $$
declare
  v_community_id uuid;
begin
  -- Get the community_id from the room (bypasses RLS due to security definer)
  select community_id into v_community_id
  from public.chat_rooms
  where id = p_room_id;

  if v_community_id is null then
    return false;
  end if;

  -- Check if the current user is a member of that community
  return exists (
    select 1 from public.community_memberships
    where community_id = v_community_id and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- Drop the old problematic policy
drop policy if exists "Room members viewable by community members" on public.chat_room_members;

-- Create new policy using the helper function
create policy "Room members viewable by community members" on public.chat_room_members
  for select using (
    is_community_member_for_room(room_id)
  );

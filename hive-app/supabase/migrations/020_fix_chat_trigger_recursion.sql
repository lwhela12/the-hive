-- Fix infinite recursion in auto_join_community_chat trigger
-- The trigger fires on community_memberships insert, but queries chat_rooms
-- which has RLS policies that check community_memberships, causing recursion

-- Recreate the function with SECURITY DEFINER to bypass RLS
create or replace function auto_join_community_chat()
returns trigger as $$
begin
  insert into public.chat_room_members (room_id, user_id)
  select r.id, NEW.user_id
  from public.chat_rooms r
  where r.community_id = NEW.community_id and r.room_type = 'community'
  on conflict (room_id, user_id) do nothing;
  return NEW;
end;
$$ language plpgsql security definer;

-- Migration: 040_group_dm_update_policy.sql
-- Adds UPDATE policy for chat_rooms to allow group DM members to rename their groups

-- Allow members of a group DM to update it (e.g., rename)
CREATE POLICY "Group DM members can update room" ON public.chat_rooms
  FOR UPDATE USING (
    room_type = 'group_dm'
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members
      WHERE room_id = chat_rooms.id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    room_type = 'group_dm'
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members
      WHERE room_id = chat_rooms.id AND user_id = auth.uid()
    )
  );

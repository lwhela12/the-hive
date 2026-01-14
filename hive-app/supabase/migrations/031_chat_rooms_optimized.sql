-- Migration: 028_chat_rooms_optimized.sql
-- Adds optimized RPC function for fetching chat rooms with all metadata in single query

-- Optimized function to get all chat rooms with metadata in a single query
-- Replaces the N+1 pattern of fetching rooms, then members, then last messages, then unread counts
CREATE OR REPLACE FUNCTION get_chat_rooms_with_data(
  p_community_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  room_id uuid,
  room_community_id uuid,
  room_type chat_room_type,
  room_name text,
  room_description text,
  room_created_by uuid,
  room_created_at timestamptz,
  members jsonb,
  last_message jsonb,
  unread_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH user_rooms AS (
    -- Get all rooms user has access to (community rooms + DMs they're in)
    SELECT DISTINCT r.id
    FROM chat_rooms r
    LEFT JOIN chat_room_members m ON m.room_id = r.id AND m.user_id = p_user_id
    WHERE r.community_id = p_community_id
      AND (r.room_type = 'community' OR m.user_id IS NOT NULL)
  ),
  room_members AS (
    -- Get members for DM rooms with user profiles
    SELECT
      m.room_id,
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'user_id', m.user_id,
          'last_read_at', m.last_read_at,
          'muted', m.muted,
          'joined_at', m.joined_at,
          'user', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'avatar_url', p.avatar_url,
            'email', p.email
          )
        )
      ) as members
    FROM chat_room_members m
    JOIN profiles p ON p.id = m.user_id
    JOIN chat_rooms r ON r.id = m.room_id
    WHERE m.room_id IN (SELECT id FROM user_rooms)
      AND r.room_type = 'dm'
    GROUP BY m.room_id
  ),
  last_messages AS (
    -- Get last message for each room using DISTINCT ON
    SELECT DISTINCT ON (rm.room_id)
      rm.room_id,
      jsonb_build_object(
        'id', rm.id,
        'content', rm.content,
        'created_at', rm.created_at,
        'sender_id', rm.sender_id,
        'edited_at', rm.edited_at,
        'sender', jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'avatar_url', p.avatar_url
        )
      ) as last_message
    FROM room_messages rm
    JOIN profiles p ON p.id = rm.sender_id
    WHERE rm.room_id IN (SELECT id FROM user_rooms)
      AND rm.deleted_at IS NULL
    ORDER BY rm.room_id, rm.created_at DESC
  ),
  user_memberships AS (
    -- Get user's membership data (last_read_at) for each room
    SELECT room_id, last_read_at
    FROM chat_room_members
    WHERE user_id = p_user_id
  ),
  unread_counts AS (
    -- Get unread count for each room (messages after last_read_at, not from self)
    SELECT
      rm.room_id,
      COUNT(*) as unread
    FROM room_messages rm
    JOIN user_memberships um ON um.room_id = rm.room_id
    WHERE rm.room_id IN (SELECT id FROM user_rooms)
      AND rm.created_at > um.last_read_at
      AND rm.sender_id != p_user_id
      AND rm.deleted_at IS NULL
    GROUP BY rm.room_id
  )
  SELECT
    r.id,
    r.community_id,
    r.room_type,
    r.name,
    r.description,
    r.created_by,
    r.created_at,
    COALESCE(rm.members, '[]'::jsonb),
    lm.last_message,
    COALESCE(uc.unread, 0)
  FROM chat_rooms r
  JOIN user_rooms ur ON ur.id = r.id
  LEFT JOIN room_members rm ON rm.room_id = r.id
  LEFT JOIN last_messages lm ON lm.room_id = r.id
  LEFT JOIN unread_counts uc ON uc.room_id = r.id
  ORDER BY
    CASE WHEN r.room_type = 'community' THEN 0 ELSE 1 END,
    COALESCE((lm.last_message->>'created_at')::timestamptz, r.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index to speed up unread count calculation
CREATE INDEX IF NOT EXISTS room_messages_room_created_sender_idx
ON public.room_messages(room_id, created_at, sender_id)
WHERE deleted_at IS NULL;

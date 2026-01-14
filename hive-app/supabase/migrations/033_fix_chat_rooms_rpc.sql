-- Fix ambiguous column reference in get_chat_rooms_with_data function
-- The return column names were conflicting with table column names

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
    SELECT DISTINCT cr.id AS ur_room_id
    FROM chat_rooms cr
    LEFT JOIN chat_room_members crm ON crm.room_id = cr.id AND crm.user_id = p_user_id
    WHERE cr.community_id = p_community_id
      AND (cr.room_type = 'community' OR crm.user_id IS NOT NULL)
  ),
  room_members_data AS (
    -- Get members for DM rooms with user profiles
    SELECT
      crm.room_id AS rmd_room_id,
      jsonb_agg(
        jsonb_build_object(
          'id', crm.id,
          'user_id', crm.user_id,
          'last_read_at', crm.last_read_at,
          'muted', crm.muted,
          'joined_at', crm.joined_at,
          'user', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'avatar_url', p.avatar_url,
            'email', p.email
          )
        )
      ) AS member_list
    FROM chat_room_members crm
    JOIN profiles p ON p.id = crm.user_id
    JOIN chat_rooms cr ON cr.id = crm.room_id
    WHERE crm.room_id IN (SELECT ur_room_id FROM user_rooms)
      AND cr.room_type = 'dm'
    GROUP BY crm.room_id
  ),
  last_messages_data AS (
    -- Get last message for each room using DISTINCT ON
    SELECT DISTINCT ON (rm.room_id)
      rm.room_id AS lmd_room_id,
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
      ) AS msg_data
    FROM room_messages rm
    JOIN profiles p ON p.id = rm.sender_id
    WHERE rm.room_id IN (SELECT ur_room_id FROM user_rooms)
      AND rm.deleted_at IS NULL
    ORDER BY rm.room_id, rm.created_at DESC
  ),
  user_memberships_data AS (
    -- Get user's membership data (last_read_at) for each room
    SELECT crm.room_id AS umd_room_id, crm.last_read_at AS umd_last_read_at
    FROM chat_room_members crm
    WHERE crm.user_id = p_user_id
  ),
  unread_counts_data AS (
    -- Get unread count for each room (messages after last_read_at, not from self)
    SELECT
      rm.room_id AS ucd_room_id,
      COUNT(*) AS unread_total
    FROM room_messages rm
    JOIN user_memberships_data umd ON umd.umd_room_id = rm.room_id
    WHERE rm.room_id IN (SELECT ur_room_id FROM user_rooms)
      AND rm.created_at > umd.umd_last_read_at
      AND rm.sender_id != p_user_id
      AND rm.deleted_at IS NULL
    GROUP BY rm.room_id
  )
  SELECT
    cr.id AS room_id,
    cr.community_id AS room_community_id,
    cr.room_type AS room_type,
    cr.name AS room_name,
    cr.description AS room_description,
    cr.created_by AS room_created_by,
    cr.created_at AS room_created_at,
    COALESCE(rmd.member_list, '[]'::jsonb) AS members,
    lmd.msg_data AS last_message,
    COALESCE(ucd.unread_total, 0) AS unread_count
  FROM chat_rooms cr
  JOIN user_rooms ur ON ur.ur_room_id = cr.id
  LEFT JOIN room_members_data rmd ON rmd.rmd_room_id = cr.id
  LEFT JOIN last_messages_data lmd ON lmd.lmd_room_id = cr.id
  LEFT JOIN unread_counts_data ucd ON ucd.ucd_room_id = cr.id
  ORDER BY
    CASE WHEN cr.room_type = 'community' THEN 0 ELSE 1 END,
    COALESCE((lmd.msg_data->>'created_at')::timestamptz, cr.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

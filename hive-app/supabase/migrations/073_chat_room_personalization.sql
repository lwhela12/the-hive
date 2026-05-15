-- Add per-member chat labels, icons, and color themes.
-- These are personal preferences, so titling a DM does not rename it for everyone else.

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS custom_title text,
  ADD COLUMN IF NOT EXISTS custom_emoji text,
  ADD COLUMN IF NOT EXISTS custom_image_url text,
  ADD COLUMN IF NOT EXISTS custom_background text DEFAULT 'honey',
  ADD COLUMN IF NOT EXISTS custom_background_image_url text;

COMMENT ON COLUMN public.chat_room_members.custom_title IS 'Personal display title for this room.';
COMMENT ON COLUMN public.chat_room_members.custom_emoji IS 'Personal emoji icon for this room.';
COMMENT ON COLUMN public.chat_room_members.custom_image_url IS 'Personal image icon URL for this room.';
COMMENT ON COLUMN public.chat_room_members.custom_background IS 'Personal chat theme key.';
COMMENT ON COLUMN public.chat_room_members.custom_background_image_url IS 'Personal chat background image URL.';

DROP FUNCTION IF EXISTS get_chat_rooms_with_data(uuid, uuid);

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
  custom_title text,
  custom_emoji text,
  custom_image_url text,
  custom_background text,
  custom_background_image_url text,
  members jsonb,
  last_message jsonb,
  unread_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH user_rooms AS (
    SELECT DISTINCT cr.id AS ur_room_id
    FROM chat_rooms cr
    LEFT JOIN chat_room_members crm ON crm.room_id = cr.id AND crm.user_id = p_user_id
    WHERE cr.community_id = p_community_id
      AND (cr.room_type = 'community' OR crm.user_id IS NOT NULL)
  ),
  room_members_data AS (
    SELECT
      crm.room_id AS rmd_room_id,
      jsonb_agg(
        jsonb_build_object(
          'id', crm.id,
          'user_id', crm.user_id,
          'last_read_at', crm.last_read_at,
          'muted', crm.muted,
          'custom_title', crm.custom_title,
          'custom_emoji', crm.custom_emoji,
          'custom_image_url', crm.custom_image_url,
          'custom_background', crm.custom_background,
          'custom_background_image_url', crm.custom_background_image_url,
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
      AND cr.room_type::text IN ('dm', 'group_dm')
    GROUP BY crm.room_id
  ),
  last_messages_data AS (
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
    SELECT
      crm.room_id AS umd_room_id,
      crm.last_read_at AS umd_last_read_at,
      crm.custom_title AS umd_custom_title,
      crm.custom_emoji AS umd_custom_emoji,
      crm.custom_image_url AS umd_custom_image_url,
      crm.custom_background AS umd_custom_background,
      crm.custom_background_image_url AS umd_custom_background_image_url
    FROM chat_room_members crm
    WHERE crm.user_id = p_user_id
  ),
  unread_counts_data AS (
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
    umd.umd_custom_title AS custom_title,
    umd.umd_custom_emoji AS custom_emoji,
    umd.umd_custom_image_url AS custom_image_url,
    umd.umd_custom_background AS custom_background,
    umd.umd_custom_background_image_url AS custom_background_image_url,
    COALESCE(rmd.member_list, '[]'::jsonb) AS members,
    lmd.msg_data AS last_message,
    COALESCE(ucd.unread_total, 0) AS unread_count
  FROM chat_rooms cr
  JOIN user_rooms ur ON ur.ur_room_id = cr.id
  LEFT JOIN user_memberships_data umd ON umd.umd_room_id = cr.id
  LEFT JOIN room_members_data rmd ON rmd.rmd_room_id = cr.id
  LEFT JOIN last_messages_data lmd ON lmd.lmd_room_id = cr.id
  LEFT JOIN unread_counts_data ucd ON ucd.ucd_room_id = cr.id
  ORDER BY
    CASE WHEN cr.room_type = 'community' THEN 0 ELSE 1 END,
    COALESCE((lmd.msg_data->>'created_at')::timestamptz, cr.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

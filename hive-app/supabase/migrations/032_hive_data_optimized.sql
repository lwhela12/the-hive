-- Migration: 029_hive_data_optimized.sql
-- Adds optimized RPC function for fetching queen bees with highlights in single query

-- Optimized function to get queen bees with their highlights in single query
-- Replaces the N+1 pattern of fetching queen bees, then highlights separately
CREATE OR REPLACE FUNCTION get_queen_bees_with_highlights(
  p_community_id uuid,
  p_months text[]
)
RETURNS TABLE (
  queen_bee jsonb,
  highlights jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    jsonb_build_object(
      'id', qb.id,
      'user_id', qb.user_id,
      'community_id', qb.community_id,
      'month', qb.month,
      'project_title', qb.project_title,
      'project_description', qb.project_description,
      'status', qb.status,
      'created_at', qb.created_at,
      'updated_at', qb.updated_at,
      'user', jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'avatar_url', p.avatar_url,
        'email', p.email
      )
    ) as queen_bee,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', mh.id,
            'highlight', mh.highlight,
            'display_order', mh.display_order,
            'meeting_id', mh.meeting_id,
            'created_at', mh.created_at
          )
          ORDER BY mh.display_order
        )
        FROM monthly_highlights mh
        WHERE mh.queen_bee_id = qb.id
      ),
      '[]'::jsonb
    ) as highlights
  FROM queen_bees qb
  JOIN profiles p ON p.id = qb.user_id
  WHERE qb.community_id = p_community_id
    AND qb.month = ANY(p_months)
  ORDER BY qb.month DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 022_fix_reply_count_trigger.sql
-- Fix the reply count trigger to use SECURITY DEFINER so it can bypass RLS

-- Recreate the trigger function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_post_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE board_posts
    SET reply_count = reply_count + 1,
        last_reply_at = NEW.created_at,
        last_reply_by = NEW.author_id
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE board_posts
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger to ensure it's attached
DROP TRIGGER IF EXISTS update_reply_count ON board_replies;
CREATE TRIGGER update_reply_count
  AFTER INSERT OR DELETE ON board_replies
  FOR EACH ROW EXECUTE FUNCTION update_post_reply_count();

-- Fix existing counts that may be out of sync
UPDATE board_posts p
SET reply_count = (
  SELECT COUNT(*) FROM board_replies r WHERE r.post_id = p.id
);

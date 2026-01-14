-- Add attachments column to board_replies
ALTER TABLE board_replies
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Add comment to document the expected structure
COMMENT ON COLUMN board_replies.attachments IS 'Array of attachment objects: [{ id: uuid, url: string, filename: string, size: number, mime_type: string, width?: number, height?: number }]';

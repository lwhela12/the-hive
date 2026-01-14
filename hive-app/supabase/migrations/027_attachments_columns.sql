-- Add attachments column to board_posts
-- Structure: [{ id, url, filename, size, mime_type, width?, height? }]
ALTER TABLE board_posts
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Add attachments column to chat_messages (for AI chat with multimodal support)
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Add attachments column to room_messages (for human-to-human messaging)
ALTER TABLE room_messages
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Add comment to document the expected structure
COMMENT ON COLUMN board_posts.attachments IS 'Array of attachment objects: [{ id: uuid, url: string, filename: string, size: number, mime_type: string, width?: number, height?: number }]';
COMMENT ON COLUMN chat_messages.attachments IS 'Array of attachment objects: [{ id: uuid, url: string, filename: string, size: number, mime_type: string, width?: number, height?: number }]';
COMMENT ON COLUMN room_messages.attachments IS 'Array of attachment objects: [{ id: uuid, url: string, filename: string, size: number, mime_type: string, width?: number, height?: number }]';

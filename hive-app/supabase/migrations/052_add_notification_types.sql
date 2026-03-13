-- Add missing notification types to the enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'board_reply';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'board_mention';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'chat_dm';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'chat_mention';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'meeting_reminder';

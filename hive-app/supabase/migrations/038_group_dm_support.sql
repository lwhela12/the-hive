-- Migration: 038_group_dm_support.sql
-- Adds support for group DMs (multi-user direct message rooms)

-- ============================================
-- ADD group_dm TO chat_room_type ENUM
-- ============================================

-- Add the new enum value (needs to be in separate transaction from usage)
ALTER TYPE chat_room_type ADD VALUE IF NOT EXISTS 'group_dm';

-- IMPORTANT: The rest of this migration uses the new enum value.
-- PostgreSQL requires that after adding an enum value, we COMMIT before using it.
-- Since Supabase migrations run in transactions, we'll use a workaround:
-- Cast through text to avoid the "unsafe use of new value" error.

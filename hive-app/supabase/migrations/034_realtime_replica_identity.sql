-- Enable REPLICA IDENTITY FULL for tables that need filtered realtime subscriptions
-- This allows Supabase Realtime to properly filter events by non-primary-key columns

-- Room messages needs filtering by room_id
ALTER TABLE public.room_messages REPLICA IDENTITY FULL;

-- Typing indicators needs filtering by room_id
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;

-- Chat room members for membership changes
ALTER TABLE public.chat_room_members REPLICA IDENTITY FULL;

-- Board posts and replies for realtime updates
ALTER TABLE public.board_posts REPLICA IDENTITY FULL;
ALTER TABLE public.board_replies REPLICA IDENTITY FULL;

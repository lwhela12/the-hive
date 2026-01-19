-- Migration: Add index on message_reactions.message_id for faster reaction queries
-- This index significantly improves chat room loading performance by allowing
-- efficient lookups of reactions by message_id

-- Create index on message_id (the primary lookup pattern for reactions)
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
ON public.message_reactions(message_id);

-- Add a comment explaining the index
COMMENT ON INDEX idx_message_reactions_message_id IS
'Index to speed up reaction lookups when loading messages in chat rooms';

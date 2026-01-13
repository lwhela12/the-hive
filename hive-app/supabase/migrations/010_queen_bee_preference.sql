-- Add queen_bee_preference field to profiles
-- Stores user's preferred Queen Bee month and reasoning

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS queen_bee_preference jsonb;

-- Example structure:
-- {
--   "preferred_month": "2025-03",
--   "reason": "Launching my product in Q1",
--   "timeframe": "Q1 2025"
-- }

COMMENT ON COLUMN profiles.queen_bee_preference IS 'User preference for their Queen Bee month, including reason and timeframe for time-sensitive objectives';

-- Add display_order field to queen_bees for custom ordering
-- This allows admins to reorder the Queen Bee queue

ALTER TABLE public.queen_bees
ADD COLUMN IF NOT EXISTS display_order integer;

-- Initialize display_order based on existing month order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY community_id ORDER BY month ASC) as rn
  FROM public.queen_bees
)
UPDATE public.queen_bees qb
SET display_order = ordered.rn
FROM ordered
WHERE qb.id = ordered.id;

-- Make display_order NOT NULL with default for new entries
ALTER TABLE public.queen_bees
ALTER COLUMN display_order SET DEFAULT 999;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_queen_bees_display_order
ON public.queen_bees(community_id, display_order);

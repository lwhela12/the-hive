-- Allow each community to store a slide deck URL that admins can update
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS slide_deck_url text;

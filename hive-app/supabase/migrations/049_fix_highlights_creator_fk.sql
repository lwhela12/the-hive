-- Migration 049: Fix created_by foreign key to reference profiles
-- This allows proper joins with the profiles table for creator info

-- Drop the existing foreign key constraint (if it exists)
alter table public.monthly_highlights
  drop constraint if exists monthly_highlights_created_by_fkey;

-- Add foreign key referencing profiles instead of auth.users
-- profiles.id is the same as auth.users.id, so this works
alter table public.monthly_highlights
  add constraint monthly_highlights_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

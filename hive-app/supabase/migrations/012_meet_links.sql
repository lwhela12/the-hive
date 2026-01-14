-- Add Google Meet link support to events
-- This allows meetings scheduled through the app to include video conferencing

-- Add meet_link column to events table
alter table public.events add column meet_link text;

-- Add comment for documentation
comment on column public.events.meet_link is 'Google Meet link for video conferencing, auto-generated when creating calendar events with conferenceData';

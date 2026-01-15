-- Add location support to events for meetings
-- Meetings can be remote (with meet_link) or in-person (with location address)

-- Add location column to events table
alter table public.events add column location text;

-- Add comment for documentation
comment on column public.events.location is 'Physical address for in-person meetings, or null for remote-only meetings';

-- Link meeting recordings to scheduled events
-- Add linked_event_id to meetings table
ALTER TABLE public.meetings
ADD COLUMN linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

-- Add status to events table for tracking completion
-- Default existing events to 'scheduled'
ALTER TABLE public.events
ADD COLUMN status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled'));

-- Index for faster lookups
CREATE INDEX idx_meetings_linked_event ON public.meetings(linked_event_id) WHERE linked_event_id IS NOT NULL;
CREATE INDEX idx_events_status ON public.events(status);

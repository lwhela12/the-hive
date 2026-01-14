-- Add assemblyai_transcript_id column to meetings table
-- This is used to match the webhook callback from AssemblyAI to the correct meeting

ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS assemblyai_transcript_id text;

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_meetings_assemblyai_transcript_id
ON public.meetings(assemblyai_transcript_id);

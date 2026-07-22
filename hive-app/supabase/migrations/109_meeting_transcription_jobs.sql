-- Voice-memo imports: one meeting can arrive as several .m4a files, each
-- transcribed separately by AssemblyAI. This table tracks the per-file jobs so
-- the transcribe webhook can stitch the full transcript once every file lands.

create table if not exists public.meeting_transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  transcript_id text unique,
  file_name text not null,
  storage_path text not null,
  position int not null default 0,
  status text not null default 'submitted', -- submitted | completed | failed
  transcript_text text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_transcription_jobs_meeting_idx
  on public.meeting_transcription_jobs(meeting_id);

alter table public.meeting_transcription_jobs enable row level security;

-- Members can watch progress; only edge functions (service role) write.
create policy "Members can view transcription jobs"
  on public.meeting_transcription_jobs
  for select using (is_community_member(community_id));

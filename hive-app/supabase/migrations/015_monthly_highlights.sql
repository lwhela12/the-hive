-- Migration 015: Monthly highlights extracted from meeting transcripts
-- Stores AI-generated bullet points about Queen Bee progress from meetings

create table public.monthly_highlights (
  id uuid default gen_random_uuid() primary key,
  queen_bee_id uuid references public.queen_bees(id) on delete cascade not null,
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  community_id uuid references public.communities(id) on delete cascade not null,
  highlight text not null,
  display_order integer default 0,
  created_at timestamptz default now()
);

-- Index for efficient querying by queen_bee_id
create index idx_monthly_highlights_queen_bee on public.monthly_highlights(queen_bee_id);
create index idx_monthly_highlights_meeting on public.monthly_highlights(meeting_id);

-- Enable RLS
alter table public.monthly_highlights enable row level security;

-- All community members can read highlights
create policy "Community members can read highlights"
  on public.monthly_highlights
  for select
  using (public.is_community_member(community_id));

-- Service role (Edge Functions) manages highlights via transcribe function
-- No user-level insert/update policies needed - only system creates these

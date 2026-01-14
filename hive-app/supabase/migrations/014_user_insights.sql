-- Migration 014: User Insights table for AI-maintained personality profiles
-- This table stores observational notes that the AI maintains about each user
-- Users can only see their own insights (strict privacy by default)

-- Create the user_insights table
create table public.user_insights (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  community_id uuid references public.communities(id) on delete cascade not null,
  personality_notes text,
  -- Future: allow sharing with specific users
  shared_with uuid[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Each user can only have one insights record per community
  unique(user_id, community_id)
);

-- Enable RLS
alter table public.user_insights enable row level security;

-- Policy: Users can only read their own insights, OR if they're in the shared_with array
create policy "Users can read own insights or if shared"
  on public.user_insights
  for select
  using (
    auth.uid() = user_id
    or auth.uid() = any(shared_with)
  );

-- Policy: Only service role (Edge Functions) can insert/update insights
-- This ensures only the AI can write to this table, not users directly
create policy "Service role can manage insights"
  on public.user_insights
  for all
  using (true)
  with check (true);

-- Note: The above policy allows service role full access.
-- Regular users with anon key cannot insert/update due to RLS.
-- The Edge Function uses the user's JWT for auth but the service role
-- for operations that need elevated privileges.

-- Actually, we need the chat function to be able to update this.
-- Let's allow users to update their own record (but only the AI will call this)
drop policy if exists "Service role can manage insights" on public.user_insights;

-- Users can insert their own insights record
create policy "Users can insert own insights"
  on public.user_insights
  for insert
  with check (auth.uid() = user_id and public.is_community_member(community_id));

-- Users can update their own insights record
create policy "Users can update own insights"
  on public.user_insights
  for update
  using (auth.uid() = user_id);

-- Create index for efficient lookups
create index idx_user_insights_user_community
  on public.user_insights(user_id, community_id);

-- Function to auto-update updated_at timestamp
create or replace function update_user_insights_timestamp()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger user_insights_updated_at
  before update on public.user_insights
  for each row execute function update_user_insights_timestamp();

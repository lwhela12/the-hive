-- Migration: 007_context_summaries.sql
-- Smart context management for LLM conversations
-- Stores cached summaries of board activity, messages, meetings, and conversation history

-- Create enum for summary types
create type context_summary_type as enum (
  'conversation',      -- Older messages in a conversation (for >20 message convos)
  'board_activity',    -- Recent board posts/replies summary
  'room_messages',     -- Human-to-human chat activity summary
  'meetings'           -- Recent meeting summaries
);

-- Context summaries table
create table public.context_summaries (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade,  -- NULL for community-wide summaries
  summary_type context_summary_type not null,
  conversation_id uuid references public.conversations(id) on delete cascade,  -- Only for 'conversation' type

  -- The actual summary content
  summary_content text not null,

  -- Metadata for cache management
  source_count int not null default 0,           -- Number of source items summarized
  last_source_timestamp timestamptz,             -- Timestamp of most recent item included
  estimated_tokens int not null default 0,       -- Rough token count for budgeting

  -- Cache control
  expires_at timestamptz not null,               -- When this summary should be regenerated

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Ensure unique summary per type/scope combination
  -- conversation_id is only relevant for 'conversation' type
  unique (community_id, user_id, summary_type, conversation_id)
);

-- Indexes for fast lookups
create index idx_context_summaries_lookup
  on public.context_summaries(community_id, user_id, summary_type);

create index idx_context_summaries_conversation
  on public.context_summaries(conversation_id)
  where conversation_id is not null;

create index idx_context_summaries_expires
  on public.context_summaries(expires_at);

-- Enable RLS
alter table public.context_summaries enable row level security;

-- Policy: Edge Functions (service role) have full access
-- Regular users cannot access this table directly
create policy "Service role full access"
  on public.context_summaries
  for all
  using (true)
  with check (true);

-- Function to update updated_at timestamp
create or replace function update_context_summary_timestamp()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger context_summary_updated
  before update on public.context_summaries
  for each row execute function update_context_summary_timestamp();

-- Function to invalidate conversation summary when new message added
create or replace function invalidate_conversation_summary()
returns trigger as $$
begin
  -- Mark the conversation summary as expired when a new message is added
  update public.context_summaries
  set expires_at = now()
  where conversation_id = NEW.conversation_id
    and summary_type = 'conversation';
  return NEW;
end;
$$ language plpgsql;

-- Trigger to invalidate conversation summary on new chat message
create trigger invalidate_summary_on_message
  after insert on public.chat_messages
  for each row
  when (NEW.conversation_id is not null)
  execute function invalidate_conversation_summary();

-- Comment explaining the table
comment on table public.context_summaries is
  'Cached summaries for LLM context. Board/messages/meetings summaries expire hourly. Conversation summaries expire when new messages are added.';

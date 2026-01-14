-- Add community_id to conversations table (missed in multi-community migration 004)

-- Add the column
alter table public.conversations add column if not exists community_id uuid references public.communities(id);

-- Backfill existing conversations with user's current community
update public.conversations c
set community_id = p.current_community_id
from public.profiles p
where c.user_id = p.id and c.community_id is null;

-- For any orphaned conversations, use the default community
update public.conversations
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

-- Make it required going forward
alter table public.conversations alter column community_id set not null;

-- Add index for performance
create index if not exists idx_conversations_community_id on public.conversations(community_id);

-- Drop old RLS policies
drop policy if exists "Users see own conversations" on public.conversations;
drop policy if exists "Users can insert own conversations" on public.conversations;
drop policy if exists "Users can update own conversations" on public.conversations;
drop policy if exists "Users can delete own conversations" on public.conversations;

-- Create new community-scoped RLS policies
create policy "Users see own conversations in community" on public.conversations
  for select using (
    auth.uid() = user_id
    and public.is_community_member(community_id)
  );

create policy "Users can insert own conversations" on public.conversations
  for insert with check (
    auth.uid() = user_id
    and public.is_community_member(community_id)
  );

create policy "Users can update own conversations" on public.conversations
  for update using (
    auth.uid() = user_id
    and public.is_community_member(community_id)
  );

create policy "Users can delete own conversations" on public.conversations
  for delete using (
    auth.uid() = user_id
    and public.is_community_member(community_id)
  );

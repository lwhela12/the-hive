-- Add user-created projects for organizing Clive conversations.

create table if not exists public.conversation_projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  community_id uuid references public.communities(id) on delete cascade not null,
  name text not null,
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.conversations
  add column if not exists project_id uuid references public.conversation_projects(id) on delete set null;

create index if not exists idx_conversation_projects_user_community
  on public.conversation_projects(user_id, community_id, display_order, created_at);

create index if not exists idx_conversations_project_id
  on public.conversations(project_id);

alter table public.conversation_projects enable row level security;

create policy "Users see own conversation projects" on public.conversation_projects
  for select using (auth.uid() = user_id);

create policy "Users can insert own conversation projects" on public.conversation_projects
  for insert with check (auth.uid() = user_id);

create policy "Users can update own conversation projects" on public.conversation_projects
  for update using (auth.uid() = user_id);

create policy "Users can delete own conversation projects" on public.conversation_projects
  for delete using (auth.uid() = user_id);

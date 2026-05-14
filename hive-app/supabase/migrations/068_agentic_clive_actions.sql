-- Give Clive a safe, confirm-before-writing action queue and board completion state.

alter table public.board_categories
  add column if not exists status text not null default 'active'
  check (status in ('active', 'completed', 'archived'));

alter table public.board_categories
  add column if not exists completed_at timestamptz;

alter table public.board_categories
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

alter table public.board_categories
  add column if not exists completion_note text;

create index if not exists board_categories_status_idx
  on public.board_categories(community_id, status);

create table if not exists public.agent_action_requests (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  summary text not null,
  action_plan jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'cancelled', 'failed')),
  result jsonb,
  created_at timestamptz default now(),
  applied_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists agent_action_requests_user_status_idx
  on public.agent_action_requests(user_id, community_id, status, created_at desc);

create index if not exists agent_action_requests_conversation_idx
  on public.agent_action_requests(conversation_id, created_at desc);

alter table public.agent_action_requests enable row level security;

drop policy if exists "Users can view own Clive action requests" on public.agent_action_requests;
create policy "Users can view own Clive action requests" on public.agent_action_requests
  for select using (
    user_id = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Users can create own Clive action requests" on public.agent_action_requests;
create policy "Users can create own Clive action requests" on public.agent_action_requests
  for insert with check (
    user_id = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Users can update own Clive action requests" on public.agent_action_requests;
create policy "Users can update own Clive action requests" on public.agent_action_requests
  for update using (
    user_id = auth.uid()
    and public.is_community_member(community_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Users can update own wishes" on public.wishes;
create policy "Users and admins can update wishes" on public.wishes
  for update using (
    public.is_community_member(community_id)
    and (auth.uid() = user_id or public.is_community_admin(community_id))
  )
  with check (
    public.is_community_member(community_id)
    and (auth.uid() = user_id or public.is_community_admin(community_id))
  );

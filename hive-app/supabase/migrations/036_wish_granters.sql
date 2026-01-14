-- Wish granters junction table for tracking who helped grant a wish (many-to-many)
create table if not exists public.wish_granters (
  id uuid default gen_random_uuid() primary key,
  wish_id uuid references public.wishes(id) on delete cascade not null,
  granter_id uuid references public.profiles(id) on delete cascade not null,
  community_id uuid references public.communities(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (wish_id, granter_id)
);

-- Add thank you message column to wishes table
alter table public.wishes add column if not exists thank_you_message text;

-- Enable RLS
alter table public.wish_granters enable row level security;

-- RLS Policies
-- Community members can view granters for wishes in their community
create policy "Community members can view wish granters"
  on public.wish_granters for select
  using (public.is_community_member(community_id));

-- Wish owners can add granters when marking as granted
create policy "Wish owners can add granters"
  on public.wish_granters for insert
  with check (
    auth.uid() = (select user_id from public.wishes where id = wish_id)
    and public.is_community_member(community_id)
  );

-- Wish owners can remove granters
create policy "Wish owners can delete granters"
  on public.wish_granters for delete
  using (
    auth.uid() = (select user_id from public.wishes where id = wish_id)
  );

-- Indexes for faster queries
create index if not exists idx_wish_granters_wish_id on public.wish_granters(wish_id);
create index if not exists idx_wish_granters_granter_id on public.wish_granters(granter_id);

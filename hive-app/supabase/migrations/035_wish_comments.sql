-- Wish comments table for community members to comment on public wishes
create table if not exists public.wish_comments (
  id uuid default gen_random_uuid() primary key,
  wish_id uuid references public.wishes(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  community_id uuid references public.communities(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.wish_comments enable row level security;

-- RLS Policies
-- Community members can view comments on wishes in their community
create policy "Community members can view wish comments"
  on public.wish_comments for select
  using (public.is_community_member(community_id));

-- Community members can add comments
create policy "Community members can add wish comments"
  on public.wish_comments for insert
  with check (
    auth.uid() = user_id
    and public.is_community_member(community_id)
  );

-- Users can delete their own comments
create policy "Users can delete own wish comments"
  on public.wish_comments for delete
  using (auth.uid() = user_id);

-- Index for faster queries
create index if not exists idx_wish_comments_wish_id on public.wish_comments(wish_id);
create index if not exists idx_wish_comments_created_at on public.wish_comments(created_at);

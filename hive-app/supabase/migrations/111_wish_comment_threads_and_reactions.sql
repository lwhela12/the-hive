-- Wish comment threads (one-level parent/child replies), edits, and reactions.

alter table public.wish_comments
  add column if not exists parent_comment_id uuid references public.wish_comments(id) on delete cascade,
  add column if not exists edited_at timestamptz;

create index if not exists idx_wish_comments_parent_id
  on public.wish_comments(parent_comment_id);

-- Members can edit their own comments (delete policy already exists in 035).
drop policy if exists "Users can update own wish comments" on public.wish_comments;
create policy "Users can update own wish comments"
  on public.wish_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reactions on wish comments, mirroring board_reactions.
create table if not exists public.wish_comment_reactions (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  comment_id uuid references public.wish_comments(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique (comment_id, user_id, emoji)
);

create index if not exists idx_wish_comment_reactions_comment_id
  on public.wish_comment_reactions(comment_id);

alter table public.wish_comment_reactions enable row level security;

drop policy if exists "Community members can view wish comment reactions" on public.wish_comment_reactions;
create policy "Community members can view wish comment reactions"
  on public.wish_comment_reactions for select
  using (public.is_community_member(community_id));

drop policy if exists "Community members can add wish comment reactions" on public.wish_comment_reactions;
create policy "Community members can add wish comment reactions"
  on public.wish_comment_reactions for insert
  with check (
    auth.uid() = user_id
    and public.is_community_member(community_id)
  );

drop policy if exists "Users can remove own wish comment reactions" on public.wish_comment_reactions;
create policy "Users can remove own wish comment reactions"
  on public.wish_comment_reactions for delete
  using (auth.uid() = user_id);

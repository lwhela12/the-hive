-- Let individual board threads become granted wishes.

alter table public.board_posts
  add column if not exists status text not null default 'active'
    check (status in ('active', 'completed'));

alter table public.board_posts
  add column if not exists archived_at timestamptz;

alter table public.board_posts
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

update public.board_posts
set archived_at = coalesce(archived_at, now()),
    status = 'active'
where status = 'archived';

alter table public.board_posts
  drop constraint if exists board_posts_status_check;

alter table public.board_posts
  add constraint board_posts_status_check check (status in ('active', 'completed'));

alter table public.board_posts
  add column if not exists completed_at timestamptz;

alter table public.board_posts
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

alter table public.board_posts
  add column if not exists completion_note text;

alter table public.board_posts
  add column if not exists granted_wish_id uuid references public.wishes(id) on delete set null;

create index if not exists board_posts_status_idx
  on public.board_posts(community_id, category_id, status, archived_at, created_at desc);

create index if not exists board_posts_granted_wish_idx
  on public.board_posts(community_id, granted_wish_id)
  where granted_wish_id is not null;

drop policy if exists "Wishes viewable by community members" on public.wishes;
create policy "Wishes viewable by community members" on public.wishes
  for select using (
    public.is_community_member(community_id)
    and (status in ('public', 'fulfilled') or auth.uid() = user_id)
  );

drop policy if exists "HD board owners can update posts in their boards" on public.board_posts;
create policy "HD board owners can update posts in their boards" on public.board_posts
  for update using (
    public.is_community_member(community_id)
    and exists (
      select 1
      from public.board_categories category
      where category.id = board_posts.category_id
        and category.community_id = board_posts.community_id
        and category.owner_user_id = auth.uid()
    )
  )
  with check (
    public.is_community_member(community_id)
    and exists (
      select 1
      from public.board_categories category
      where category.id = board_posts.category_id
        and category.community_id = board_posts.community_id
        and category.owner_user_id = auth.uid()
    )
  );

drop policy if exists "HD board owners can delete posts in their boards" on public.board_posts;
create policy "HD board owners can delete posts in their boards" on public.board_posts
  for delete using (
    public.is_community_member(community_id)
    and exists (
      select 1
      from public.board_categories category
      where category.id = board_posts.category_id
        and category.community_id = board_posts.community_id
        and category.owner_user_id = auth.uid()
    )
  );

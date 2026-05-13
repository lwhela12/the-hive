-- Link custom board topics to everyone or to specific member profiles.

alter table public.board_categories
  add column if not exists audience text not null default 'community'
  check (audience in ('community', 'members'));

create table if not exists public.board_category_member_tags (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  category_id uuid references public.board_categories(id) on delete cascade not null,
  tagged_user_id uuid references public.profiles(id) on delete cascade not null,
  tagged_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (category_id, tagged_user_id)
);

create index if not exists board_category_member_tags_category_idx
  on public.board_category_member_tags(category_id);

create index if not exists board_category_member_tags_user_idx
  on public.board_category_member_tags(tagged_user_id);

alter table public.board_category_member_tags enable row level security;

drop policy if exists "Category member tags viewable by community members" on public.board_category_member_tags;
create policy "Category member tags viewable by community members" on public.board_category_member_tags
  for select using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_category_member_tags.community_id
        and user_id = auth.uid()
    )
  );

drop policy if exists "Category creators can tag members" on public.board_category_member_tags;
create policy "Category creators can tag members" on public.board_category_member_tags
  for insert with check (
    tagged_by = auth.uid()
    and exists (
      select 1 from public.community_memberships
      where community_id = board_category_member_tags.community_id
        and user_id = auth.uid()
    )
    and exists (
      select 1 from public.board_categories
      where id = board_category_member_tags.category_id
        and community_id = board_category_member_tags.community_id
        and (
          created_by = auth.uid()
          or exists (
            select 1 from public.community_memberships
            where community_id = board_categories.community_id
              and user_id = auth.uid()
              and role = 'admin'
          )
        )
    )
    and exists (
      select 1 from public.community_memberships
      where community_id = board_category_member_tags.community_id
        and user_id = board_category_member_tags.tagged_user_id
    )
  );

drop policy if exists "Category creators can remove member tags" on public.board_category_member_tags;
create policy "Category creators can remove member tags" on public.board_category_member_tags
  for delete using (
    exists (
      select 1 from public.board_categories
      where id = board_category_member_tags.category_id
        and community_id = board_category_member_tags.community_id
        and (
          created_by = auth.uid()
          or exists (
            select 1 from public.community_memberships
            where community_id = board_categories.community_id
              and user_id = auth.uid()
              and role = 'admin'
          )
        )
    )
  );

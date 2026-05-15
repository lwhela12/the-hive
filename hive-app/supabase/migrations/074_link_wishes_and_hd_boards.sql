-- Link wishes and HD boards so one dream can have both a public ask and a working board.

alter table public.wishes
  add column if not exists board_category_id uuid references public.board_categories(id) on delete set null;

alter table public.wishes
  add column if not exists source_board_post_id uuid references public.board_posts(id) on delete set null;

alter table public.board_categories
  add column if not exists source_wish_id uuid references public.wishes(id) on delete set null;

create index if not exists wishes_board_category_idx
  on public.wishes(community_id, board_category_id, status, created_at desc);

create index if not exists board_categories_source_wish_idx
  on public.board_categories(community_id, source_wish_id);

drop policy if exists "Admins can insert community wishes" on public.wishes;
create policy "Admins can insert community wishes" on public.wishes
  for insert with check (
    public.is_community_admin(community_id)
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = wishes.community_id
        and membership.user_id = wishes.user_id
    )
  );

-- Keep Brit's personal photography ask distinct from her PMU/business goals.
update public.board_categories
set description = 'Brit is looking for recommendations and contact info for photographers who would be good for a sexy photo shoot for her upcoming marriage.'
where topic_kind = 'hd_board'
  and name ilike 'Brit%HD:%'
  and name ilike '%photo shoot%';

update public.action_items
set description = 'Share a photographer recommendation for Brit''s upcoming-marriage sexy photo shoot HD board if you know one.'
where description = 'Share a photographer recommendation for Brit''s sexy photo shoot HD board if you know one.';

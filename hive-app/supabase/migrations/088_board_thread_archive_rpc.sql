-- Keep board-thread archive and restore actions working through one checked RPC.

alter table public.board_posts
  add column if not exists archived_at timestamptz;

alter table public.board_posts
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists board_posts_archive_state_idx
  on public.board_posts(community_id, category_id, archived_at, created_at desc);

create or replace function public.set_board_post_archived_state(
  p_post_id uuid,
  p_community_id uuid,
  p_restore boolean default false
)
returns table (
  post_id uuid,
  archived_at timestamptz,
  archived_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_author_id uuid;
  v_owner_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to archive board threads.' using errcode = '42501';
  end if;

  select post.author_id, category.owner_user_id
    into v_author_id, v_owner_user_id
  from public.board_posts post
  join public.board_categories category
    on category.id = post.category_id
   and category.community_id = post.community_id
  where post.id = p_post_id
    and post.community_id = p_community_id;

  if not found then
    raise exception 'Board thread not found.' using errcode = 'P0002';
  end if;

  if not public.is_community_member(p_community_id) then
    raise exception 'You are not a member of this community.' using errcode = '42501';
  end if;

  if v_author_id <> v_user_id
    and coalesce(v_owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user_id
    and not public.is_community_admin(p_community_id)
  then
    raise exception 'You do not have permission to archive this board thread.' using errcode = '42501';
  end if;

  return query
  update public.board_posts post
     set archived_at = case when p_restore then null else now() end,
         archived_by = case when p_restore then null else v_user_id end
   where post.id = p_post_id
     and post.community_id = p_community_id
  returning post.id, post.archived_at, post.archived_by;
end;
$$;

grant execute on function public.set_board_post_archived_state(uuid, uuid, boolean) to authenticated;

-- Reuse OG's HIVE Help board as the one shared home. Its historical member
-- threads keep members-only visibility, including their replies and reactions.
do $$
declare
  v_og uuid;
  v_owner uuid;
  v_board uuid;
  v_private_posts uuid[];
begin
  select id into v_og from public.communities where slug = 'default' limit 1;
  select id into v_owner from public.profiles where lower(email) = 'natwalstead@gmail.com' limit 1;
  if v_og is null or v_owner is null then
    raise exception 'OG HIVE and its owner are required for HIVE Help.';
  end if;

  select id into v_board from public.board_categories
    where community_id = v_og and topic_kind = 'helper_log' and name = 'HIVE Help'
      and status = 'active'
    order by created_at desc limit 1;
  if v_board is null then
    raise exception 'The existing active OG HIVE Help board was not found.';
  end if;

  -- The seeded board had no creator. Record its current owner so every HIVE
  -- member can identify Nat's focus without reading Nat's profile row.
  update public.board_categories set created_by = v_owner where id = v_board;

  if exists (select 1 from public.board_categories where id = v_board and reach = 'hive') then
    -- Serialize posts while the reach trigger runs: a new members-only thread
    -- between the snapshot and trigger would otherwise be widened by mistake.
    lock table public.board_posts in share row exclusive mode;
    -- Migration 232 widens every thread when a board moves. Remember exactly
    -- which posts were private and restore them before this transaction commits.
    select coalesce(array_agg(id), '{}'::uuid[]) into v_private_posts
      from public.board_posts where category_id = v_board and visibility = 'members';
    update public.board_categories set reach = 'all_hives' where id = v_board;
    update public.board_posts set visibility = 'members'
      where id = any(v_private_posts) and visibility = 'all_hives';
  end if;

  -- An earlier draft of this seed used public reach. Keep this specific plan
  -- inside HIVE-Wide even if that draft was applied outside the ledger.
  update public.board_posts set visibility = 'all_hives'
    where category_id = v_board and author_id = v_owner
      and title = 'HIVE Help — Meals for our neighbors'
      and archived_at is null and visibility = 'public';

  insert into public.board_posts (
    community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
  )
  select v_og, v_board, v_owner, 'HIVE Help — Meals for our neighbors',
    'Right now, collect plastic to-go containers. Later, collect canned goods. Then we’ll pick a day to prep meals in bulk and deliver them to people experiencing homelessness in Las Vegas. If you’re elsewhere, coordinate in your area or do your own thing. Share what you did on the HIVE Help board.',
    false, false, 'all_hives', 'active'
  where not exists (
    select 1 from public.board_posts
      where category_id = v_board and author_id = v_owner
        and title = 'HIVE Help — Meals for our neighbors'
        and archived_at is null
  );
end $$;

-- The public site must not call an older public post "current" after Nat
-- moves the next focus to HIVE-Wide without publishing it. Select the newest
-- owner focus first, then expose it only if that particular post is public.
create or replace view public.public_help_focus as
select p.id, p.title, p.content, p.created_at
from public.board_posts p
join public.board_categories c on c.id = p.category_id
join public.communities co on co.id = p.community_id
where p.id = (
  select candidate.id
  from public.board_posts candidate
  join public.board_categories board on board.id = candidate.category_id
  join public.communities host on host.id = candidate.community_id
  join public.profiles author on author.id = candidate.author_id
  where board.topic_kind = 'helper_log'
    and board.name = 'HIVE Help'
    and board.status = 'active'
    and host.slug = 'default'
    and author.is_owner = true
    and candidate.visibility in ('all_hives', 'public')
    and candidate.title ~* 'HIVE Help(ers)?[[:space:]]*[—–-]+'
    and candidate.title !~* 'ideas'
    and candidate.status = 'active'
    and candidate.archived_at is null
  order by candidate.created_at desc
  limit 1
)
  and p.visibility = 'public'
  and co.max_share_scope = 'public'
  and not exists (
    select 1 from public.profiles member_profile
    cross join lateral (select lower(split_part(trim(member_profile.name), ' ', 1)) as first_name) n
    where member_profile.name is not null and length(n.first_name) >= 3
      and n.first_name = any (regexp_split_to_array(
        trim(regexp_replace(lower(coalesce(p.title, '') || ' ' || coalesce(p.content, '')), '[^a-z0-9]+', ' ', 'g')),
        '[[:space:]]+'
      ))
  );

alter view public.public_help_focus set (security_invoker = false);

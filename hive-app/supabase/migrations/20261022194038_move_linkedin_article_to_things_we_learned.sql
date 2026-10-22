-- This is a placement correction, not a rewrite: retain the post ID, author,
-- body, timestamp, and its reply. Both boards belong to Tech HIVE, so replies
-- and reactions already carry the correct community_id and remain untouched.

do $$
declare
  tech_hive_id uuid;
  brag_board_id uuid;
  things_we_learned_id uuid;
  current_category_id uuid;
  moved_count integer;
begin
  select id into tech_hive_id
  from public.communities
  where slug = 'tech'
  limit 1;

  select id into brag_board_id
  from public.board_categories
  where community_id = tech_hive_id
    and name = 'HIVE Brag Board'
  limit 1;

  select id into things_we_learned_id
  from public.board_categories
  where community_id = tech_hive_id
    and name = 'Things We Learned'
    and status = 'active'
  limit 1;

  if tech_hive_id is null or brag_board_id is null or things_we_learned_id is null then
    raise exception 'Expected Tech HIVE, HIVE Brag Board, and Things We Learned before moving the LinkedIn workflow thread.';
  end if;

  select category_id into current_category_id
  from public.board_posts
  where id = 'e1fdef47-7588-42e2-9429-7351fee778bb'
    and community_id = tech_hive_id
    and title = 'LinkedIn Article from a call';

  -- The live record was carefully moved before this source receipt was
  -- committed. Keep later migration application safe and idempotent.
  if current_category_id = things_we_learned_id then
    return;
  end if;

  update public.board_posts
  set
    category_id = things_we_learned_id,
    visibility = 'members'
  where id = 'e1fdef47-7588-42e2-9429-7351fee778bb'
    and category_id = brag_board_id
    and community_id = tech_hive_id
    and title = 'LinkedIn Article from a call';

  get diagnostics moved_count = row_count;
  if moved_count <> 1 then
    raise exception 'Expected to move exactly one LinkedIn workflow thread; moved %.', moved_count;
  end if;
end;
$$;

-- Give members a short, current explanation of the board cleanup without
-- exposing the private Tech discussion itself.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-10-22',
  'Boards keep conversations in the right place',
  'Boards and HD Wishes have separate homes. Board threads no longer show a Granted action or linked-wish controls; useful workflows can live in Things We Learned.',
  owner.id
from (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1
  from public.app_news existing
  where existing.occurred_on = date '2026-10-22'
    and existing.title = 'Boards keep conversations in the right place'
);

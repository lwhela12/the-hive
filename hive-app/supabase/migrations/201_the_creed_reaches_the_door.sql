-- The creed reaches the door.
--
-- The words live on a board so Nat can rewrite a line without a deploy
-- (lib/creed.ts), and the join screen fetches them before showing the tick-box.
-- It never got them. Board reads require community membership, and somebody
-- standing at an invitation is by definition not a member yet — so every
-- person who has ever joined a HIVE agreed to `CREED_FALLBACK`, the one-line
-- emergency sentence, and not one of them has seen the real creed.
--
-- Opening the boards table to strangers to fix that would be a large door for
-- a small errand. This is a narrow one: the creed page, by name, and nothing
-- else. It takes no arguments, so it cannot be pointed at another board.

create or replace function public.hive_creed()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select bp.content
  from public.board_posts bp
  join public.board_categories bc on bc.id = bp.category_id
  where bc.name = 'The HIVE Creed'
    and bp.title = 'The HIVE Creed'
    and bp.archived_at is null
  order by bp.is_pinned desc, bp.created_at
  limit 1;
$$;

comment on function public.hive_creed() is
  'The HIVE Creed as plain text, readable by somebody who has not joined yet. The only board content reachable without membership, and only this one page.';

grant execute on function public.hive_creed() to anon, authenticated;

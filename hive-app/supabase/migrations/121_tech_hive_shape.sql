-- Tech HIVE takes its own shape
--
-- Three small corrections after Nat walked through the new HIVE (2026-07-31).

-- 1. HD boards belong to OG HIVE's history and nowhere else.
--
-- Migration 075 gives every new member a personal HD board the moment they
-- join. That was right when there was one HIVE. Nat: "we dont do those anymore
-- anywhere, thats super old news." The trigger stays wired up for the original
-- HIVE, where existing boards and their wish links still work, and stops making
-- new ones anywhere else — so Lucas and Kelly arrive to a clean Tech HIVE.
create or replace function public.ensure_member_hd_board_on_membership()
returns trigger as $$
begin
  if exists (
    select 1 from public.communities c
    where c.id = NEW.community_id and c.slug = 'default'
  ) then
    perform public.ensure_member_hd_board(NEW.community_id, NEW.user_id);
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

-- The one that already got made. It has no posts, so nothing is lost.
delete from public.board_categories bc
using public.communities c
where c.id = bc.community_id
  and c.slug = 'tech'
  and bc.topic_kind = 'hd_board';

-- 2. Things We Learned says how far back it means.
--
-- Nat: "this crew literally went down a dead end for 2 years at one point and
-- we're still trying to crawl back."
update public.board_categories bc
set description = 'The thing you wish you had known yesterday. Or last week. Or last month. Or two years ago. Post it here and save the next one of us the same detour.'
from public.communities c
where c.id = bc.community_id
  and c.slug = 'tech'
  and bc.name = 'Things We Learned';

-- 3. Nat's home hexes follow the new default again.
--
-- The three hexes are the doors to things with no other way in: the Honey Pot,
-- swapping HIVEs, and telling us the app is broken. Nat's row still carried the
-- older trio picked before swapping existed; null means "use whatever the
-- default is", which is now the right three.
update public.profiles
set home_shortcuts = null
where id = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359'
  and home_shortcuts = array['honey_pot', 'boards', 'feedback'];

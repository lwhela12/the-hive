-- 185: the public site reads the HIVE Creed from its one live home.
--
-- The Creed's words still live on the one HIVE-Wide board. This view exposes
-- only that pinned page's words and edit time, so the public site stays current
-- when Nat edits the board without opening board_posts to anonymous readers.
create or replace view public.public_hive_creed as
select
  bp.content,
  coalesce(bp.edited_at, bp.created_at) as updated_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
where bc.name = 'The HIVE Creed'
  and bc.reach = 'all_hives'
  and bp.title = 'The HIVE Creed'
  and bp.is_pinned = true
  and coalesce(bp.status, 'active') <> 'archived'
order by coalesce(bp.edited_at, bp.created_at) desc
limit 1;

alter view public.public_hive_creed set (security_invoker = false);
revoke all on public.public_hive_creed from anon, authenticated;
grant select on public.public_hive_creed to anon, authenticated;

comment on view public.public_hive_creed is
  'The one pinned HIVE-Wide Creed page, readable by the public site. Replies and every other board/post field remain private.';

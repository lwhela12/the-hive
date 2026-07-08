-- READ-ONLY report: find likely duplicate wishes per member.
-- Run in the Supabase SQL editor (or via service-role REST) — changes nothing.
-- Groups live (public/private/fulfilled) wishes by member + normalized title and
-- lists every group with more than one copy, so we can pick which copy to keep
-- before writing the dedupe migration.

with live_wishes as (
  select
    w.id,
    w.community_id,
    w.user_id,
    p.name as member_name,
    w.title,
    w.description,
    w.status,
    w.is_active,
    w.created_at,
    w.source_board_post_id,
    trim(lower(regexp_replace(coalesce(w.title, w.description, ''), '[^a-z0-9]+', ' ', 'g'))) as norm_title,
    (select count(*) from public.wish_granters g where g.wish_id = w.id) as granter_count,
    (select count(*) from public.wish_comments c where c.wish_id = w.id) as comment_count
  from public.wishes w
  join public.profiles p on p.id = w.user_id
  where w.status in ('public', 'private', 'fulfilled')
),
dupe_groups as (
  select community_id, user_id, norm_title
  from live_wishes
  where norm_title <> ''
  group by community_id, user_id, norm_title
  having count(*) > 1
)
select
  lw.member_name,
  lw.norm_title as duplicate_group,
  lw.id as wish_id,
  lw.title,
  lw.status,
  lw.is_active,
  lw.granter_count,
  lw.comment_count,
  (lw.source_board_post_id is not null) as linked_to_board,
  lw.created_at
from live_wishes lw
join dupe_groups dg
  on dg.community_id = lw.community_id
 and dg.user_id = lw.user_id
 and dg.norm_title = lw.norm_title
order by lw.member_name, lw.norm_title, lw.created_at;

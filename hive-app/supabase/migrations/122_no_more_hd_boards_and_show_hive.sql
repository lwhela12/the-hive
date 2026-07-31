-- HD boards are done, and a third HIVE opens
--
-- Nat, 2026-07-31: "No one should get an HD board ever, that was scrapped ages
-- ago." Migration 121 stopped them outside OG HIVE. This stops them everywhere.

-- The trigger goes. The functions stay on disk as history — nothing else calls
-- them, and migration 075 is easier to read with its parts still present.
drop trigger if exists auto_create_member_hd_board on public.community_memberships;

-- The two still showing. Archived rather than deleted: between them they hold a
-- handful of posts, and losing somebody's words to a tidy-up is the one mistake
-- that can't be walked back. They drop out of the boards list either way.
update public.board_categories
set status = 'archived'
where topic_kind = 'hd_board'
  and status = 'active';

-- Show HIVE.
--
-- Deliberately bare: a name and a colour. What this HIVE is for, and whose it
-- is, belongs to the people in it and is the kind of thing that must not leak
-- between HIVEs. Purple so it is never mistaken for the other two at a glance.
insert into public.communities (name, slug, accent_color, created_by)
select 'Show HIVE', 'show', '#6b4a8f', 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359'
where not exists (select 1 from public.communities where slug = 'show');

insert into public.community_memberships (community_id, user_id, role)
select c.id, 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359', 'admin'
from public.communities c where c.slug = 'show'
on conflict (community_id, user_id) do nothing;

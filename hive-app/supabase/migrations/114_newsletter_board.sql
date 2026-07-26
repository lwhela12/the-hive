-- The HIVE Newsletter board.
--
-- The newsletter should be reachable more than one way: as an email from Wix,
-- as a page on the public site, and as a board in the app. "If there's only one
-- way to skin a cat, people forget" (Nat 2026-07-25) — different brains reach
-- for different surfaces, so the same information gets several front doors.
--
-- This board holds the whole lifecycle: the shout-out and compliment threads
-- that collect material through the month, and the finished newsletter posted
-- when it goes out. Code finds it by topic_kind, not by name, so renaming the
-- board doesn't break the halfway check-in or the drafter.

alter table public.board_categories
  drop constraint if exists board_categories_topic_kind_check;

alter table public.board_categories
  add constraint board_categories_topic_kind_check
  check (topic_kind = any (array['discussion', 'hd_board', 'helper_log', 'newsletter']));

insert into public.board_categories (
  community_id, name, description, category_type, icon,
  display_order, topic_kind, audience, status, is_system
)
select
  c.id,
  'HIVE Newsletter',
  'Every month''s newsletter lives here, plus the shout-outs and compliments that go into it.',
  'custom',
  '📰',
  125,
  'newsletter',
  'community',
  'active',
  false
from public.communities c
where not exists (
  select 1 from public.board_categories existing
  where existing.community_id = c.id and existing.topic_kind = 'newsletter'
);

-- Move the collection threads off Announcements, where they were only ever
-- parked because that's the board that existed.
update public.board_posts bp
set category_id = nl.id
from public.board_categories nl
where nl.community_id = bp.community_id
  and nl.topic_kind = 'newsletter'
  and (bp.title ilike '%newsletter%' or bp.title ilike '%compliment corner%')
  and bp.category_id <> nl.id;

-- Compliment Corner gets its own board.
--
-- It started as a monthly thread that opened alongside the newsletter, which
-- framed it as a chore with a deadline. But the good version is standing: "if
-- you just feel like complimenting someone" (Nat 2026-07-25). @ them and they
-- get a little love note the moment you post — that only works if the door is
-- always open.
--
-- The monthly thread still lives here so the halfway check-in has somewhere to
-- post, but nothing stops anyone starting their own.

alter table public.board_categories
  drop constraint if exists board_categories_topic_kind_check;

alter table public.board_categories
  add constraint board_categories_topic_kind_check
  check (topic_kind = any (array['discussion', 'hd_board', 'helper_log', 'newsletter', 'compliments']));

insert into public.board_categories (
  community_id, name, description, category_type, icon,
  display_order, topic_kind, audience, status, is_system
)
select
  c.id,
  'Compliment Corner',
  'Say something nice, any time. @ someone and they get a little love note the moment you post. Compliments also get read out at the meeting.',
  'custom',
  '💐',
  126,
  'compliments',
  'community',
  'active',
  false
from public.communities c
where not exists (
  select 1 from public.board_categories existing
  where existing.community_id = c.id and existing.topic_kind = 'compliments'
);

update public.board_posts bp
set category_id = cc.id
from public.board_categories cc
where cc.community_id = bp.community_id
  and cc.topic_kind = 'compliments'
  and bp.title ilike '%compliment corner%'
  and bp.category_id <> cc.id;

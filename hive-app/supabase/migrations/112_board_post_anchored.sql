-- Standing reference threads (e.g. "HIVE Help Ideas 💡") anchor to the BOTTOM
-- of their board so the monthly threads read as an uninterrupted timeline.

alter table public.board_posts
  add column if not exists is_anchored boolean default false;

comment on column public.board_posts.is_anchored is
  'Anchored threads sort to the bottom of their board — standing reference threads that should not float on activity.';

-- The month's HIVE Help focus, out where people can find it
--
-- Nat's steer (2026-07-31): someone who isn't in the HIVE might still want to
-- drop off a donation or turn up to a soup kitchen day. They can only do that
-- if they know what this month's focus is, so the public site needs to show it.
--
-- The focus already exists as a post in the HIVE Helpers board, titled like
-- "August HIVE Help — Shelter Donation". What that board does NOT want to
-- publish is the rest of the thread: the replies are members logging their own
-- acts of kindness, which is their business, not the internet's.
--
-- So this borrows the shape that already works for events (migration 118): a
-- post carries a visibility flag, private by default, and the public site reads
-- a narrow view rather than the table. A focus goes public because a member
-- said so, never because nobody said otherwise.

alter table public.board_posts
  add column if not exists visibility text not null default 'members';

alter table public.board_posts
  drop constraint if exists board_posts_visibility_check;

alter table public.board_posts
  add constraint board_posts_visibility_check
  check (visibility = any (array['members', 'public']));

comment on column public.board_posts.visibility is
  'members = stays inside the HIVE; public = safe to show on the public site. Only helper_log posts are read publicly today.';

-- The newest public focus wins, so a new month simply replaces the old one on
-- the site. Replies, reactions, author and attachments stay out of it.
create or replace view public.public_help_focus as
select
  p.id,
  p.title,
  p.content,
  p.created_at
from public.board_posts p
join public.board_categories c on c.id = p.category_id
join public.communities co on co.id = p.community_id
where p.visibility = 'public'
  and c.topic_kind = 'helper_log'
  and co.slug = 'default'
  and p.status = 'active'
  and p.archived_at is null
order by p.created_at desc
limit 1;

alter view public.public_help_focus set (security_invoker = false);

revoke all on public.public_help_focus from anon, authenticated;
grant select on public.public_help_focus to anon, authenticated;

comment on view public.public_help_focus is
  'The one HIVE Help focus a member has marked public, title and body only. Read by the public site. Anonymous visitors have no access to public.board_posts itself.';

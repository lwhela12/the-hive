-- The Buzz: newsletters people can actually read
--
-- Wix let a stranger read the newsletter on the website, because it was a blog.
-- Moving to Vercel quietly dropped that, and it's most of why the newsletter has
-- felt confusing all day (Nat 2026-08-01): the sign-up form asked people to
-- commit to something they couldn't see first.
--
-- Board posts already carried 'members' or 'public'. They get the middle rung
-- too, and the same ceiling as everything else — so a HIVE that keeps to itself
-- cannot publish a newsletter outward however anybody taps.

alter table public.board_posts
  drop constraint if exists board_posts_visibility_check;
alter table public.board_posts
  add constraint board_posts_visibility_check
  check (visibility in ('members', 'all_hives', 'public'));

drop policy if exists "Posts viewable by community members" on public.board_posts;
create policy "Posts viewable by scope" on public.board_posts
  for select using (
    public.is_community_member(community_id)
    or (
      visibility in ('all_hives', 'public')
      and public.community_shares_beyond_hive(community_id)
      and public.is_any_community_member()
    )
  );

-- What a stranger may read: finished newsletters, from HIVEs allowed all the way
-- out, and nothing else on any other board. Hand-picked columns, same shape as
-- public_events — anonymous visitors never touch board_posts itself.
create or replace view public.public_newsletters as
select
  bp.id,
  bp.title,
  bp.content,
  bp.created_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
join public.communities c on c.id = bp.community_id
where bc.topic_kind = 'newsletter'
  and bp.visibility = 'public'
  and c.max_share_scope = 'public'
  and coalesce(bp.status, 'active') <> 'archived'
order by bp.created_at desc;

alter view public.public_newsletters set (security_invoker = false);
revoke all on public.public_newsletters from anon, authenticated;
grant select on public.public_newsletters to anon, authenticated;

comment on view public.public_newsletters is
  'Published newsletters, readable by anyone. Only posts on a newsletter board, only those marked public, and only from HIVEs whose ceiling reaches the public. Read by the public site.';

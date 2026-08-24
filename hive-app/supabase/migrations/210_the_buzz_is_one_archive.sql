-- The Buzz is a HIVE-Wide archive, even though its imported source rows live
-- on OG HIVE's retired newsletter board.
--
-- Before in-app sending existed, completed newsletters were imported with
-- members-only visibility and no newsletter_sends receipt. The app owner could
-- read them through broad owner access, but other HIVE members could not, and
-- the UI mislabelled every one as a private draft. A finished Buzz issue is
-- readable by every HIVE member when it was published, has a live send receipt,
-- or predates the in-app send path. A newer unsent issue remains private under
-- the existing board-post policies until it is genuinely sent/published.

create or replace function public.is_completed_buzz_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.board_posts post
    join public.board_categories category on category.id = post.category_id
    where post.id = p_post_id
      and post.archived_at is null
      and category.topic_kind = 'newsletter'
      and (
        post.visibility = 'public'
        or post.created_at < timestamptz '2026-08-12 18:03:25+00'
        or exists (
          select 1
          from public.newsletter_sends send
          where send.post_id = post.id
            and send.mode = 'live'
        )
      )
  );
$$;

revoke all on function public.is_completed_buzz_post(uuid) from public, anon;
grant execute on function public.is_completed_buzz_post(uuid) to authenticated;

drop policy if exists "HIVE members locate the Buzz archive" on public.board_categories;
create policy "HIVE members locate the Buzz archive"
on public.board_categories
for select
using (
  public.is_any_community_member()
  and topic_kind = 'newsletter'
);

drop policy if exists "HIVE members read the completed Buzz archive" on public.board_posts;
create policy "HIVE members read the completed Buzz archive"
on public.board_posts
for select
using (
  public.is_any_community_member()
  and public.is_completed_buzz_post(id)
);

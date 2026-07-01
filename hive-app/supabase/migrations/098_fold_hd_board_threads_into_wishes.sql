-- Make wishes the canonical surface for member asks.
-- Existing member HD-board threads are preserved as source/support threads,
-- while the visible ask moves onto the member profile and Home wishes feed.

alter table public.wishes
  add column if not exists title text;

create or replace function public.hive_wish_title_from_text(value text)
returns text as $$
  select nullif(
    left(
      regexp_replace(
        regexp_replace(
          trim(coalesce(value, '')),
          '^(I[[:space:]]+)?(wish(ed)?([[:space:]]+(to|for))?|want(ed)?([[:space:]]+to)?|would[[:space:]]+like([[:space:]]+to)?|need(ed)?|am[[:space:]]+looking[[:space:]]+for|I''m[[:space:]]+looking[[:space:]]+for|I[[:space:]]+am[[:space:]]+looking[[:space:]]+for)[[:space:]]+',
          '',
          'i'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      80
    ),
    ''
  );
$$ language sql immutable;

update public.wishes
set title = public.hive_wish_title_from_text(description)
where title is null
  and nullif(trim(description), '') is not null;

with member_wish_threads as (
  select
    post.id as post_id,
    post.community_id,
    post.category_id,
    post.author_id,
    post.title,
    post.content,
    coalesce(post.status, 'active') as status,
    post.completed_at,
    post.completed_by,
    post.completion_note,
    post.created_at,
    category.owner_user_id
  from public.board_posts post
  join public.board_categories category on category.id = post.category_id
  where category.topic_kind = 'hd_board'
    and category.owner_user_id is not null
    and category.goal_title is null
    and post.archived_at is null
),
updated_wishes as (
  update public.wishes wish
  set
    user_id = coalesce(member_wish_threads.owner_user_id, wish.user_id),
    title = coalesce(nullif(trim(wish.title), ''), public.hive_wish_title_from_text(member_wish_threads.title), public.hive_wish_title_from_text(member_wish_threads.content)),
    description = coalesce(nullif(trim(wish.description), ''), nullif(trim(member_wish_threads.content), ''), member_wish_threads.title),
    raw_input = coalesce(nullif(trim(wish.raw_input), ''), nullif(trim(member_wish_threads.content), ''), member_wish_threads.title),
    board_category_id = member_wish_threads.category_id,
    source_board_post_id = member_wish_threads.post_id,
    status = case when member_wish_threads.status = 'completed' then 'fulfilled'::wish_status else 'public'::wish_status end,
    is_active = member_wish_threads.status <> 'completed',
    fulfilled_at = case when member_wish_threads.status = 'completed' then coalesce(wish.fulfilled_at, member_wish_threads.completed_at, now()) else wish.fulfilled_at end,
    fulfilled_by = case when member_wish_threads.status = 'completed' then coalesce(wish.fulfilled_by, member_wish_threads.completed_by) else wish.fulfilled_by end,
    thank_you_message = case when member_wish_threads.status = 'completed' then coalesce(wish.thank_you_message, member_wish_threads.completion_note, 'Granted from a support thread.') else wish.thank_you_message end
  from member_wish_threads
  where wish.community_id = member_wish_threads.community_id
    and wish.source_board_post_id = member_wish_threads.post_id
  returning wish.id, member_wish_threads.post_id
)
insert into public.wishes (
  user_id,
  community_id,
  title,
  description,
  raw_input,
  status,
  is_active,
  extracted_from,
  fulfilled_at,
  fulfilled_by,
  thank_you_message,
  board_category_id,
  source_board_post_id,
  created_at
)
select
  member_wish_threads.owner_user_id,
  member_wish_threads.community_id,
  coalesce(
    public.hive_wish_title_from_text(member_wish_threads.title),
    public.hive_wish_title_from_text(member_wish_threads.content)
  ),
  coalesce(nullif(trim(member_wish_threads.content), ''), member_wish_threads.title),
  coalesce(nullif(trim(member_wish_threads.content), ''), member_wish_threads.title),
  case when member_wish_threads.status = 'completed' then 'fulfilled'::wish_status else 'public'::wish_status end,
  member_wish_threads.status <> 'completed',
  'manual'::extraction_source,
  case when member_wish_threads.status = 'completed' then coalesce(member_wish_threads.completed_at, now()) else null end,
  case when member_wish_threads.status = 'completed' then member_wish_threads.completed_by else null end,
  case when member_wish_threads.status = 'completed' then coalesce(member_wish_threads.completion_note, 'Granted from a support thread.') else null end,
  member_wish_threads.category_id,
  member_wish_threads.post_id,
  member_wish_threads.created_at
from member_wish_threads
where not exists (
  select 1
  from public.wishes existing
  where existing.community_id = member_wish_threads.community_id
    and existing.source_board_post_id = member_wish_threads.post_id
);

insert into public.wish_comments (
  wish_id,
  user_id,
  community_id,
  content,
  created_at
)
select
  wish.id,
  reply.author_id,
  reply.community_id,
  reply.content,
  reply.created_at
from public.board_replies reply
join public.wishes wish
  on wish.source_board_post_id = reply.post_id
 and wish.community_id = reply.community_id
where nullif(trim(reply.content), '') is not null
  and not exists (
    select 1
    from public.wish_comments existing
    where existing.wish_id = wish.id
      and existing.user_id = reply.author_id
      and existing.created_at = reply.created_at
      and existing.content = reply.content
  );

update public.board_categories category
set
  status = 'archived',
  completed_at = coalesce(category.completed_at, now()),
  completion_note = coalesce(category.completion_note, 'Folded into member profile wishes.')
where category.topic_kind = 'hd_board'
  and category.owner_user_id is not null
  and category.goal_title is null
  and coalesce(category.status, 'active') = 'active'
  and exists (
    select 1
    from public.wishes wish
    where wish.community_id = category.community_id
      and wish.board_category_id = category.id
  );

create index if not exists wishes_quick_title_idx
  on public.wishes(community_id, user_id, status, created_at desc)
  where title is not null;

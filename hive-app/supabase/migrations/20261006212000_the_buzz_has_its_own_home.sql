-- The Buzz is a publication, never a board post.
--
-- Earlier versions reused board_posts as storage. That leaked board authorship,
-- board activity mail and board language into a workflow that has its own
-- editor, archive, email sender and public reader. Move every issue and every
-- old contribution before removing those legacy rows. Guarded counts make the
-- move fail atomically rather than lose a word or a receipt.

begin;

create table public.newsletter_issues (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  visibility text not null default 'members'
    check (visibility in ('members', 'public')),
  is_pinned boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.newsletter_issues is
  'Canonical issues of The Buzz. A newsletter issue is a publication and is never stored as a board post.';

create index newsletter_issues_archive_created_idx
  on public.newsletter_issues (archived_at, created_at desc);
create index newsletter_issues_published_idx
  on public.newsletter_issues (published_at desc)
  where published_at is not null and archived_at is null;

alter table public.newsletter_issues enable row level security;
grant select, insert, update, delete on public.newsletter_issues to authenticated;

create policy "Owners can read every newsletter issue"
  on public.newsletter_issues for select
  using (public.is_hive_owner());
create policy "Members can read published newsletter issues"
  on public.newsletter_issues for select
  using (published_at is not null and archived_at is null);
create policy "Owners can create newsletter issues"
  on public.newsletter_issues for insert
  with check (public.is_hive_owner() and created_by = auth.uid());
create policy "Owners can update newsletter issues"
  on public.newsletter_issues for update
  using (public.is_hive_owner())
  with check (public.is_hive_owner());
create policy "Owners can delete newsletter issues"
  on public.newsletter_issues for delete
  using (public.is_hive_owner());

-- The old board replies are historical source material, not new member-facing
-- intake. Preserve them for Nat's records; End of the month remains the intake.
create table public.newsletter_legacy_contributions (
  id uuid primary key,
  issue_id uuid not null references public.newsletter_issues(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  share_scope text not null default 'hive',
  legacy_parent_reply_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table public.newsletter_legacy_contributions is
  'Read-only preservation of contributions formerly attached to newsletter-shaped board threads. New newsletter material comes from End of the month.';

alter table public.newsletter_legacy_contributions enable row level security;
grant select on public.newsletter_legacy_contributions to authenticated;
create policy "Owners can read legacy newsletter contributions"
  on public.newsletter_legacy_contributions for select
  using (public.is_hive_owner());

do $$
declare
  expected_issues integer;
  copied_issues integer;
  expected_contributions integer;
  copied_contributions integer;
begin
  select count(*) into expected_issues
  from public.board_posts post
  join public.board_categories category on category.id = post.category_id
  where category.topic_kind = 'newsletter';

  insert into public.newsletter_issues (
    id, title, content, created_by, visibility, is_pinned, attachments,
    published_at, archived_at, archived_by, created_at, updated_at
  )
  select
    post.id,
    post.title,
    post.content,
    post.author_id,
    case when post.visibility = 'public' then 'public' else 'members' end,
    coalesce(post.is_pinned, false),
    coalesce(post.attachments, '[]'::jsonb),
    coalesce(
      (select min(send.created_at)
       from public.newsletter_sends send
       where send.post_id = post.id and send.mode = 'live'),
      case when post.visibility = 'public' then coalesce(post.edited_at, post.created_at) end
    ),
    post.archived_at,
    post.archived_by,
    coalesce(post.created_at, now()),
    coalesce(post.edited_at, post.created_at, now())
  from public.board_posts post
  join public.board_categories category on category.id = post.category_id
  where category.topic_kind = 'newsletter';

  select count(*) into copied_issues from public.newsletter_issues;
  if copied_issues <> expected_issues then
    raise exception 'Newsletter issue copy mismatch: expected %, copied %', expected_issues, copied_issues;
  end if;

  select count(*) into expected_contributions
  from public.board_replies reply
  join public.board_posts post on post.id = reply.post_id
  join public.board_categories category on category.id = post.category_id
  where category.topic_kind = 'newsletter';

  insert into public.newsletter_legacy_contributions (
    id, issue_id, author_id, content, attachments, share_scope,
    legacy_parent_reply_id, created_at, updated_at
  )
  select
    reply.id,
    reply.post_id,
    reply.author_id,
    reply.content,
    coalesce(reply.attachments, '[]'::jsonb),
    reply.share_scope,
    reply.parent_reply_id,
    coalesce(reply.created_at, now()),
    reply.edited_at
  from public.board_replies reply
  join public.board_posts post on post.id = reply.post_id
  join public.board_categories category on category.id = post.category_id
  where category.topic_kind = 'newsletter';

  select count(*) into copied_contributions from public.newsletter_legacy_contributions;
  if copied_contributions <> expected_contributions then
    raise exception 'Newsletter contribution copy mismatch: expected %, copied %', expected_contributions, copied_contributions;
  end if;
end
$$;

alter table public.newsletter_sends
  add column issue_id uuid references public.newsletter_issues(id) on delete cascade;

update public.newsletter_sends set issue_id = post_id;

do $$
begin
  if exists (select 1 from public.newsletter_sends where issue_id is null) then
    raise exception 'Newsletter send receipt copy left rows without an issue';
  end if;
end
$$;

alter table public.newsletter_sends alter column issue_id set not null;
drop index if exists public.newsletter_sends_post_idx;
alter table public.newsletter_sends drop constraint if exists newsletter_sends_post_id_fkey;
alter table public.newsletter_sends drop column post_id;
create index newsletter_sends_issue_idx
  on public.newsletter_sends (issue_id, mode, created_at desc);

drop view if exists public.public_newsletters;
create view public.public_newsletters as
select issue.id, issue.title, issue.content, issue.created_at
from public.newsletter_issues issue
where issue.visibility = 'public'
  and issue.published_at is not null
  and issue.archived_at is null
order by issue.published_at desc, issue.created_at desc;

alter view public.public_newsletters set (security_invoker = false);
revoke all on public.public_newsletters from public, anon, authenticated;
grant select on public.public_newsletters to anon, authenticated;
comment on view public.public_newsletters is
  'Owner-reviewed published newsletter issues. The same approved letter powers email, The Buzz and the public site.';

-- Only after every issue, contribution and send receipt has a dedicated home
-- do the newsletter-shaped board rows leave the board system.
delete from public.board_posts post
using public.board_categories category
where post.category_id = category.id
  and category.topic_kind = 'newsletter';

delete from public.board_categories where topic_kind = 'newsletter';

alter table public.board_categories
  drop constraint if exists board_categories_topic_kind_check;
alter table public.board_categories
  add constraint board_categories_topic_kind_check
  check (topic_kind = any (array['discussion', 'hd_board', 'helper_log', 'compliments']));

comment on column public.board_categories.topic_kind is
  'Board taxonomy only. The Buzz is stored in newsletter_issues and is never a board.';

-- With newsletter rows gone, board activity needs no newsletter exception.
create or replace function public.notify_owners_of_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  activity_kind text;
  actor uuid;
  hive_id uuid;
begin
  if tg_table_name = 'daily_question_answers' then
    activity_kind := 'daily_question'; actor := new.user_id; hive_id := new.community_id;
  elsif tg_table_name = 'board_posts' then
    activity_kind := 'board_post'; actor := new.author_id; hive_id := new.community_id;
  elsif tg_table_name = 'board_replies' then
    activity_kind := 'board_reply'; actor := new.author_id; hive_id := new.community_id;
  elsif tg_table_name = 'wishes' then
    activity_kind := 'wish'; actor := new.user_id; hive_id := new.community_id;
  else
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/notify-admin-activity',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := jsonb_build_object(
        'kind', activity_kind,
        'community_id', hive_id,
        'actor_id', actor,
        'record_id', new.id
      )
    );
  exception when others then
    raise warning '[notify_owners_of_activity] % on % could not notify: %', activity_kind, tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.notify_owners_of_activity() is
  'Sends opted-in HIVE activity mail. The Buzz is absent because newsletter issues are not board rows.';

commit;

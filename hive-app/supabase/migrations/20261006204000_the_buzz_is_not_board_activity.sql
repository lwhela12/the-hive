-- The Buzz has its own editor, archive, email and public release. Its durable
-- rows happen to share board_posts storage, but a draft is not a member board
-- action and must never produce "posted on a board" mail. The edge sender
-- repeats this check defensively; stopping at the trigger avoids scheduling
-- the misleading request in the first place.

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
    activity_kind := 'daily_question';
    actor := new.user_id;
    hive_id := new.community_id;
  elsif tg_table_name = 'board_posts' then
    if exists (
      select 1
      from public.board_categories category
      where category.id = new.category_id
        and category.topic_kind = 'newsletter'
    ) then
      return new;
    end if;
    activity_kind := 'board_post';
    actor := new.author_id;
    hive_id := new.community_id;
  elsif tg_table_name = 'board_replies' then
    if exists (
      select 1
      from public.board_posts post
      join public.board_categories category on category.id = post.category_id
      where post.id = new.post_id
        and category.topic_kind = 'newsletter'
    ) then
      return new;
    end if;
    activity_kind := 'board_reply';
    actor := new.author_id;
    hive_id := new.community_id;
  elsif tg_table_name = 'wishes' then
    activity_kind := 'wish';
    actor := new.user_id;
    hive_id := new.community_id;
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
  'Sends opted-in HIVE activity mail while excluding The Buzz, whose drafts and releases are not board activity.';

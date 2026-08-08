-- The backup broadcast trigger (095) fires on the words hive/all/everyone/
-- every/everybody/group/community/members. `wide`, `hivewide` and `allhives`
-- were added to the app's own broadcast word list on 2026-08-06
-- (`lib/mentions.ts`, `BROADCAST_MENTION_HANDLES`) but nobody came back to
-- teach this trigger the same words. A reply that says only "@wide" today
-- gets no guaranteed notification at all — it relies entirely on the client
-- path, which this trigger exists to back up. Bring the two word lists back
-- in sync.

create or replace function public.create_board_broadcast_mention_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mention_text text;
  sender_name text;
  board_name text;
  post_title text;
  source_post_id uuid;
  preview text;
  notification_title text;
  notification_metadata jsonb;
begin
  if TG_TABLE_NAME = 'board_posts' then
    mention_text := coalesce(new.title, '') || ' ' || coalesce(new.content, '');
    source_post_id := new.id;
    post_title := new.title;
    preview := left(coalesce(nullif(new.content, ''), new.title, ''), 100);

    select category.name
      into board_name
      from public.board_categories category
      where category.id = new.category_id;
  else
    mention_text := coalesce(new.content, '');
    source_post_id := new.post_id;
    preview := left(coalesce(new.content, ''), 100);

    select post.title, category.name
      into post_title, board_name
      from public.board_posts post
      left join public.board_categories category on category.id = post.category_id
      where post.id = new.post_id;
  end if;

  if mention_text !~* '(^|[^a-z0-9_])@(hive|all|everyone|every|everybody|group|community|members|wide|hivewide|allhives)([^a-z0-9_]|$)' then
    return new;
  end if;

  select profile.name
    into sender_name
    from public.profiles profile
    where profile.id = new.author_id;

  notification_title := coalesce(sender_name, 'Someone')
    || ' mentioned everyone on '
    || coalesce(board_name, 'a message board');

  notification_metadata := jsonb_build_object(
    'post_id', source_post_id,
    'sender_id', new.author_id,
    'board_name', board_name,
    'post_title', post_title,
    'broadcast', true
  );

  insert into public.notifications (
    user_id,
    community_id,
    notification_type,
    title,
    content,
    metadata
  )
  select
    membership.user_id,
    new.community_id,
    'board_mention'::notification_type,
    notification_title,
    preview,
    notification_metadata
  from public.community_memberships membership
  where membership.community_id = new.community_id
    and membership.user_id <> new.author_id
    and not exists (
      select 1
      from public.notifications existing
      where existing.user_id = membership.user_id
        and existing.community_id = new.community_id
        and existing.notification_type = 'board_mention'::notification_type
        and existing.created_at > now() - interval '5 minutes'
        and existing.metadata->>'post_id' = source_post_id::text
        and existing.metadata->>'sender_id' = new.author_id::text
    );

  return new;
end;
$$;

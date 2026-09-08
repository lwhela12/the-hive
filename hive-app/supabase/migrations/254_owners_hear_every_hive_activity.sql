-- Nat, 2026-09-08: "as admin I want to get an email when anyone does anything
-- in any HIVE" — a daily question answered, a board post or reply, a wish.
-- Real time, one email per action (her choice, over a daily digest).
--
-- One trigger function, attached to four tables, calling the
-- `notify-admin-activity` edge function via net.http_post (async — never
-- blocks the member's own insert). Wrapped in its own exception handler:
-- a notification that fails to send must never take down the write it is
-- reporting on. Same vault-secret pattern the check-in-reminder cron already
-- uses to reach an edge function with the service-role key.

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
    activity_kind := 'board_post';
    actor := new.author_id;
    hive_id := new.community_id;
  elsif tg_table_name = 'board_replies' then
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
    -- The member's post/answer/wish must save no matter what happens to the
    -- owner notification. Log and move on.
    raise warning '[notify_owners_of_activity] % on % could not notify: %', activity_kind, tg_table_name, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_owners_daily_question on public.daily_question_answers;
create trigger notify_owners_daily_question
  after insert on public.daily_question_answers
  for each row execute function public.notify_owners_of_activity();

drop trigger if exists notify_owners_board_post on public.board_posts;
create trigger notify_owners_board_post
  after insert on public.board_posts
  for each row execute function public.notify_owners_of_activity();

drop trigger if exists notify_owners_board_reply on public.board_replies;
create trigger notify_owners_board_reply
  after insert on public.board_replies
  for each row execute function public.notify_owners_of_activity();

drop trigger if exists notify_owners_wish on public.wishes;
create trigger notify_owners_wish
  after insert on public.wishes
  for each row execute function public.notify_owners_of_activity();

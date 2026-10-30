-- Remove the retired community and every row that belongs to it. The lookup
-- uses stable human identifiers so a fresh database and the live project take
-- the same path without baking generated child-row IDs into the migration.

create temp table _retired_hive_ids(id uuid primary key) on commit drop;

insert into _retired_hive_ids(id)
select id
from public.communities
where slug = 'show'
   or lower(name) in ('production hive', 'pro hive', 'show hive');

-- Nobody should be left pointing at a community that no longer exists. Prefer
-- OG, then Tech, then any other remaining membership; null is honest when a
-- person has no other membership.
update public.profiles p
set current_community_id = (
  select cm.community_id
  from public.community_memberships cm
  join public.communities c on c.id = cm.community_id
  where cm.user_id = p.id
    and cm.community_id not in (select id from _retired_hive_ids)
  order by
    case c.slug when 'default' then 0 when 'tech' then 1 else 2 end,
    cm.created_at,
    cm.community_id
  limit 1
)
where p.current_community_id in (select id from _retired_hive_ids);

-- Two HIVE-wide editorial rows named the retired community even though they
-- did not carry community_id. Remove those references explicitly.
delete from public.app_news
where to_jsonb(app_news)::text ~* '(production[ _-]*hive|pro[ _-]*hive|show[ _-]*hive|show-proposal)';

delete from public.newsletter_legacy_contributions
where to_jsonb(newsletter_legacy_contributions)::text ~* '(production[ _-]*hive|pro[ _-]*hive|show[ _-]*hive|show-proposal)';

-- Remove dependent rows with NO ACTION foreign keys before their parents.
delete from public.notifications n
where n.community_id in (select id from _retired_hive_ids)
   or n.related_action_item_id in (
     select id from public.action_items where community_id in (select id from _retired_hive_ids)
   )
   or n.related_meeting_id in (
     select id from public.meetings where community_id in (select id from _retired_hive_ids)
   )
   or n.related_wish_id in (
     select id from public.wishes where community_id in (select id from _retired_hive_ids)
   )
   or to_jsonb(n)::text ~* '(production[ _-]*hive|pro[ _-]*hive|show[ _-]*hive|show-proposal)';

delete from public.ball_check_in_delivery d
where d.room_id in (
    select id from public.chat_rooms where community_id in (select id from _retired_hive_ids)
  )
   or d.message_id in (
    select id from public.room_messages where community_id in (select id from _retired_hive_ids)
  );

delete from public.meeting_member_reflections r
where r.community_id in (select id from _retired_hive_ids)
   or r.meeting_id in (
     select id from public.events where community_id in (select id from _retired_hive_ids)
   );

delete from public.check_in_completions c
where c.community_id in (select id from _retired_hive_ids)
   or c.community_key in (select id::text from _retired_hive_ids)
   or c.survey_id in (
     select id from public.surveys where community_id in (select id from _retired_hive_ids)
   );

delete from public.check_in_answer_history
where community_id in (select id from _retired_hive_ids);

delete from public.survey_responses r
where r.community_id in (select id from _retired_hive_ids)
   or r.community_key in (select id from _retired_hive_ids)
   or r.survey_id in (
     select id from public.surveys where community_id in (select id from _retired_hive_ids)
   );

-- Deleting a current response archives it. Clear that trigger-created history
-- after the response delete as well as the history that already existed.
delete from public.check_in_answer_history
where community_id in (select id from _retired_hive_ids);

-- Direct community-owned rows. Child tables with CASCADE constraints disappear
-- with these parents; SET NULL links are intentionally allowed to clear.
delete from public.action_items where community_id in (select id from _retired_hive_ids);
delete from public.meet_transcript_imports where community_id in (select id from _retired_hive_ids);
delete from public.meeting_attendance_reports where community_id in (select id from _retired_hive_ids);
delete from public.meeting_transcription_jobs where community_id in (select id from _retired_hive_ids);
delete from public.surveys where community_id in (select id from _retired_hive_ids);
delete from public.meetings where community_id in (select id from _retired_hive_ids);
delete from public.events where community_id in (select id from _retired_hive_ids);

delete from public.chat_messages where community_id in (select id from _retired_hive_ids);
delete from public.context_summaries where community_id in (select id from _retired_hive_ids);
delete from public.conversations where community_id in (select id from _retired_hive_ids);
delete from public.conversation_projects where community_id in (select id from _retired_hive_ids);
delete from public.room_messages where community_id in (select id from _retired_hive_ids);
delete from public.chat_rooms where community_id in (select id from _retired_hive_ids);

delete from public.board_reactions where community_id in (select id from _retired_hive_ids);
delete from public.board_replies where community_id in (select id from _retired_hive_ids);
delete from public.board_posts where community_id in (select id from _retired_hive_ids);
delete from public.board_category_member_tags where community_id in (select id from _retired_hive_ids);
delete from public.board_categories where community_id in (select id from _retired_hive_ids);

delete from public.wish_comment_reactions where community_id in (select id from _retired_hive_ids);
delete from public.wish_comments where community_id in (select id from _retired_hive_ids);
delete from public.wish_granters where community_id in (select id from _retired_hive_ids);
delete from public.wishes where community_id in (select id from _retired_hive_ids);

delete from public.honey_pot_transactions where community_id in (select id from _retired_hive_ids);
delete from public.honey_pot where community_id in (select id from _retired_hive_ids);
delete from public.skills where community_id in (select id from _retired_hive_ids);
delete from public.skills_graveyard where community_id in (select id from _retired_hive_ids);
delete from public.daily_question_answers where community_id in (select id from _retired_hive_ids);
delete from public.hive_cards where community_id in (select id from _retired_hive_ids);
delete from public.monthly_focus where community_id in (select id from _retired_hive_ids);
delete from public.nat_check_in_feedback where community_id in (select id from _retired_hive_ids);
delete from public.tour_marks where community_id in (select id from _retired_hive_ids);
delete from public.user_insights where community_id in (select id from _retired_hive_ids);
delete from public.deck_sessions where community_id in (select id from _retired_hive_ids);
delete from public.agent_action_requests where community_id in (select id from _retired_hive_ids);
delete from public.app_feedback where community_id in (select id from _retired_hive_ids);
delete from public.assistant_usage where community_id in (select id from _retired_hive_ids);
delete from public.community_invites where community_id in (select id from _retired_hive_ids);
delete from public.community_memberships where community_id in (select id from _retired_hive_ids);

delete from public.communities where id in (select id from _retired_hive_ids);

-- This column existed only for the retired community's profile prompt.
alter table public.community_memberships drop column if exists hive_goal;

-- Remove retired title aliases from the shared database classifier too.
create or replace function public.check_in_kind(title text)
returns text
language sql
immutable
as $function$
  select case
    when title ~* 'end[-\s]of[-\s]year\s+check-?in' then 'year'
    when title ~* 'quarterly\s+check-?in' then 'quarter'
    when title ~* '(end of the month|halfway check-?in)' then 'endofmonth'
    when title ~* '(before (our first meeting|we meet)|monthly\s+check-?in)' then 'premeeting'
  end;
$function$;

-- Fail atomically if a community-owned row or human-facing textual reference
-- was missed. The migration either removes the whole footprint or none of it.
do $$
declare
  col record;
  hit_count bigint;
begin
  for col in
    select c.table_name, c.column_name
    from information_schema.columns c
    join pg_class pc on pc.relname = c.table_name
    join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = c.table_schema
    where c.table_schema = 'public'
      and pc.relkind in ('r', 'p')
      and c.column_name in ('community_id', 'current_community_id', 'community_key')
  loop
    execute format(
      'select count(*) from public.%I where %I::text in (select id::text from _retired_hive_ids)',
      col.table_name,
      col.column_name
    ) into hit_count;
    if hit_count > 0 then
      raise exception 'Retired HIVE rows remain in %.%: %', col.table_name, col.column_name, hit_count;
    end if;
  end loop;

  for col in
    select pc.relname as table_name
    from pg_class pc
    join pg_namespace pn on pn.oid = pc.relnamespace
    where pn.nspname = 'public' and pc.relkind in ('r', 'p')
  loop
    execute format(
      'select count(*) from public.%I t where to_jsonb(t)::text ~* %L',
      col.table_name,
      '(production[ _-]*hive|pro[ _-]*hive|show[ _-]*hive|show-proposal)'
    ) into hit_count;
    if hit_count > 0 then
      raise exception 'Retired HIVE text remains in %: % row(s)', col.table_name, hit_count;
    end if;
  end loop;
end $$;

begin;
create table public.nat_check_in_feedback (
 source_table text not null, source_id uuid not null, user_id uuid not null references public.profiles(id),
 survey_id uuid not null, community_id uuid, answers jsonb not null default '{}', updated_at timestamptz not null default now(),
 primary key(source_table,source_id)
);
alter table public.nat_check_in_feedback enable row level security;
revoke all on public.nat_check_in_feedback from anon, authenticated;
grant select on public.nat_check_in_feedback to authenticated;
create policy "Author and Nat can read personal feedback" on public.nat_check_in_feedback for select to authenticated
 using (user_id=auth.uid() or auth.uid()='d85dd42e-81fc-4b4c-8f3a-b2cf39c76359'::uuid);

create function public.separate_nat_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare private_keys text[] := array['member_goal','member_support','member_value','member_next_year']; v_answers jsonb;
begin
 if new.community_id is distinct from 'e38d99a8-3aa8-4ace-8381-e56bb9991cf9'::uuid then return new; end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_answers from jsonb_each(coalesce(new.answers,'{}')) where key=any(private_keys);
 if v_answers <> '{}'::jsonb then
  insert into public.nat_check_in_feedback(source_table,source_id,user_id,survey_id,community_id,answers)
   values(tg_table_name,new.id,new.user_id,new.survey_id,new.community_id,v_answers)
  on conflict(source_table,source_id) do update set answers=public.nat_check_in_feedback.answers || excluded.answers,updated_at=now();
 end if;
 new.answers := new.answers - private_keys;
 if tg_table_name='check_in_answer_history' then
  new.original_row := jsonb_set(new.original_row,'{answers}',coalesce(new.original_row->'answers','{}') - private_keys);
 end if;
 return new;
end $$;
revoke all on function public.separate_nat_feedback() from public,anon,authenticated;
create trigger a_separate_nat_feedback before insert or update on public.survey_responses for each row execute function public.separate_nat_feedback();
create trigger a_separate_nat_feedback before insert or update on public.check_in_completions for each row execute function public.separate_nat_feedback();
create trigger a_separate_nat_feedback before insert or update on public.check_in_answer_history for each row execute function public.separate_nat_feedback();
-- Move existing personal answers into protected storage, preserving their text.
update public.survey_responses set answers=answers where community_id='e38d99a8-3aa8-4ace-8381-e56bb9991cf9' and answers ?| array['member_goal','member_support','member_value','member_next_year'];
update public.check_in_completions set answers=answers where community_id='e38d99a8-3aa8-4ace-8381-e56bb9991cf9' and answers ?| array['member_goal','member_support','member_value','member_next_year'];
update public.check_in_answer_history set answers=answers where community_id='e38d99a8-3aa8-4ace-8381-e56bb9991cf9' and (answers ?| array['member_goal','member_support','member_value','member_next_year'] or coalesce(original_row->'answers','{}') ?| array['member_goal','member_support','member_value','member_next_year']);

create table public.ball_check_in_delivery(receipt_id uuid primary key,room_id uuid not null references public.chat_rooms(id),message_id uuid references public.room_messages(id));
alter table public.ball_check_in_delivery enable row level security;
revoke all on public.ball_check_in_delivery from public,anon,authenticated;

do $$ declare room uuid; begin
 insert into public.chat_rooms(community_id,room_type,name,description,created_by,reach)
 values('e38d99a8-3aa8-4ace-8381-e56bb9991cf9','group_dm','Bumblebee Ball · Party Planning','Planning answers from the OG check-in. Nat, Nic, Izzy, and Meg.','d85dd42e-81fc-4b4c-8f3a-b2cf39c76359','hive') returning id into room;
 insert into public.chat_room_members(room_id,user_id) select room, unnest(array['d85dd42e-81fc-4b4c-8f3a-b2cf39c76359','b2f96ae4-4ac3-4f66-9e97-d956727f80cb','e7705563-9c0a-48bd-b24b-d464d90077cf','438ba5db-a064-4eba-b022-8c1ba3595f9d']::uuid[]);
end $$;
create function public.route_ball_check_in() returns trigger language plpgsql security definer set search_path='' as $$
declare room uuid; message uuid; author_name text; body text; row record;
begin
 if new.community_id <> 'e38d99a8-3aa8-4ace-8381-e56bb9991cf9'::uuid or new.occurrence <> 'meeting:131d6001-43e4-4426-b07c-9cb7f51e1ab7' then return new; end if;
 if not (new.answers ? 'ball_choice') then return new; end if;
 select id into room from public.chat_rooms where name='Bumblebee Ball · Party Planning' and created_by='d85dd42e-81fc-4b4c-8f3a-b2cf39c76359' and room_type='group_dm' and reach='hive' limit 1;
 if room is null or (select array_agg(user_id order by user_id) from public.chat_room_members where room_id=room) is distinct from (select array_agg(x order by x) from unnest(array['d85dd42e-81fc-4b4c-8f3a-b2cf39c76359','b2f96ae4-4ac3-4f66-9e97-d956727f80cb','e7705563-9c0a-48bd-b24b-d464d90077cf','438ba5db-a064-4eba-b022-8c1ba3595f9d']::uuid[]) x) then return new; end if;
 select name into author_name from public.profiles where id=new.user_id;
 body := 'Bumblebee Ball check-in · ' || coalesce(author_name,'HIVE member') || E'\nAutomatically shared from their check-in.';
 for row in select * from (values ('ball_choice','Planning preference'),('ball_timing','Timing'),('ball_audience','Guests'),('ball_food','Food'),('ball_awards','Awards'),('ball_dress','Dress code')) as fields(key,label) loop
  if coalesce(new.answers->>row.key,'')<>'' then body := body || E'\n' || row.label || ': ' || (new.answers->>row.key); end if;
 end loop;
 insert into public.ball_check_in_delivery(receipt_id,room_id) values(new.id,room) on conflict(receipt_id) do nothing;
 select message_id into message from public.ball_check_in_delivery where receipt_id=new.id for update;
 if message is null then
  insert into public.room_messages(community_id,room_id,sender_id,content) values(new.community_id,room,'d85dd42e-81fc-4b4c-8f3a-b2cf39c76359',body) returning id into message;
  update public.ball_check_in_delivery set message_id=message where receipt_id=new.id;
 else
  update public.room_messages set content=body,edited_at=now() where id=message and content is distinct from body;
 end if;
 return new;
end $$;
revoke all on function public.route_ball_check_in() from public,anon,authenticated;
create trigger route_ball_check_in after insert or update on public.check_in_completions for each row execute function public.route_ball_check_in();
commit;

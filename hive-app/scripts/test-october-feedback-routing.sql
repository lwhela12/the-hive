-- Temporary fixture only. Every message and fixture write rolls back.
begin;
+create temporary table feedback_fixture(id uuid default gen_random_uuid(), user_id uuid, survey_id uuid, community_id uuid, occurrence text, answers jsonb);
create trigger a_priv before insert or update on feedback_fixture for each row execute function public.separate_nat_feedback();
create trigger b_route after insert or update on feedback_fixture for each row execute function public.route_ball_check_in();
insert into feedback_fixture(user_id,survey_id,community_id,occurrence,answers)
values('d85dd42e-81fc-4b4c-8f3a-b2cf39c76359',gen_random_uuid(),'e38d99a8-3aa8-4ace-8381-e56bb9991cf9','meeting:131d6001-43e4-4426-b07c-9cb7f51e1ab7','{"member_goal":"PRIVATE TEST GOAL","ball_choice":"I would like input","ball_food":"TEST FOOD"}');
do $$ begin
 if exists(select 1 from feedback_fixture where answers ? 'member_goal') then raise exception 'Private answer leaked'; end if;
 if not exists(select 1 from public.nat_check_in_feedback where source_table='feedback_fixture' and answers->>'member_goal'='PRIVATE TEST GOAL') then raise exception 'Private answer lost'; end if;
 if exists(select 1 from public.room_messages where content like '%PRIVATE TEST GOAL%') then raise exception 'Private answer routed to chat'; end if;
 if not exists(select 1 from public.ball_check_in_delivery d join public.room_messages m on m.id=d.message_id where d.receipt_id in(select id from feedback_fixture) and m.content like '%TEST FOOD%') then raise exception 'Ball did not route'; end if;
end $$;
update feedback_fixture set answers=answers;
do $$ begin if (select count(*) from public.ball_check_in_delivery where receipt_id in(select id from feedback_fixture))<>1 then raise exception 'Repeated delivery';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin if exists(select 1 from public.nat_check_in_feedback where source_table='feedback_fixture') then raise exception 'Other identity can read personal feedback';end if;end $$;
select set_config('request.jwt.claim.sub','d85dd42e-81fc-4b4c-8f3a-b2cf39c76359',true);
do $$ begin if not exists(select 1 from public.nat_check_in_feedback where source_table='feedback_fixture') then raise exception 'Nat cannot read';end if;end $$;
reset role;
select 'PASS: private storage, Nat-only reader, Ball-only routing, update deduplication. Transaction rolled back.' as result;
rollback;

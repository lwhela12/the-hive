-- Run with a trusted DB connection. Every fixture write rolls back.
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email='natwalstead@gmail.com'), true);
set local role authenticated;
do $$
declare c uuid; w uuid; t uuid; saved uuid; result jsonb;
begin
 select cm.community_id into c from public.community_memberships cm join public.communities community on community.id=cm.community_id where cm.user_id=auth.uid() and community.slug='default';
 w:=public.file_check_in_wish(c,'Regression fixture: tonight focus',null,'hive');
 saved:=public.file_check_in_wish(c,'Regression fixture: tonight focus!',null,'all_hives');
 if saved<>w or (select share_scope from wishes where id=w)<>'hive' then raise exception 'Reuse/audience regression'; end if;
 result:=public.capture_meeting_jot(c,auth.uid(),'Regression fixture: tonight focus',array[auth.uid()],null,true,null,'Regression fixture: tonight focus');
 if (result->>'wish_id')::uuid<>w or result->>'created_wish_id' is not null then raise exception 'Meeting jot duplicated ask'; end if;
 insert into public.action_items(description,assigned_to,community_id,related_wish_id,related_user_id) values('Fixture pending step',auth.uid(),c,w,auth.uid()) returning id into t;
 update public.wishes set status='fulfilled',is_active=false where id=w;
 if exists(select 1 from action_items where id=t and (archived_at is null or completed or completed_at is not null)) then raise exception 'Closing wish must retire, never complete'; end if;
 update public.action_items set archived_at=null where id=t;
 if exists(select 1 from action_items where id=t and archived_at is null) then raise exception 'Stale task reopened'; end if;
 begin
  perform public.file_check_in_wish(c,'Regression fixture: tonight focus');
  raise exception 'Closed draft recreated';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.capture_meeting_jot(c,auth.uid(),'Regression fixture: tonight focus',array[auth.uid()],null,true,null,'Regression fixture: tonight focus');
  raise exception 'Closed meeting wish recreated';
 exception when invalid_parameter_value then null; end;
 w:=public.file_check_in_wish(c,'Regression fixture: remove ask',null,'hive');
 perform public.soft_delete_wish(w);
 begin
  perform public.file_check_in_wish(c,'Regression fixture: remove ask');
  raise exception 'Deleted draft recreated';
 exception when invalid_parameter_value then null; end;
end $$;
rollback;
select 'PASS: atomic reuse, audience, jot reuse, close retires obligations, stale reopen blocked, removed draft blocked; fixtures rolled back' as result;

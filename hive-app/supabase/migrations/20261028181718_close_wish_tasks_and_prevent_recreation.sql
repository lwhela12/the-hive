-- A closed ask retires its remaining obligations without claiming they were done.
create or replace function public.wish_text_key(value text) returns text
language sql immutable strict set search_path = public
as $$ select regexp_replace(lower(trim(value)), '[^[:alnum:]]', '', 'g') $$;

create or replace function public.retire_closed_wish_tasks() returns trigger
language plpgsql security definer set search_path = public
as $$ begin
  if new.status <> 'public' or new.is_active = false or new.deleted_at is not null then
    update public.action_items set archived_at = now(),
      archived_by = coalesce(auth.uid(), new.deleted_by, new.fulfilled_by),
      archive_reason = case when new.deleted_at is not null then 'wish_removed' when new.status = 'fulfilled' then 'wish_granted' else 'wish_closed' end
    where related_wish_id = new.id and completed = false and archived_at is null;
  end if;
  return new;
end $$;
revoke all on function public.retire_closed_wish_tasks() from public, anon, authenticated;
create trigger retire_closed_wish_tasks after update of status, is_active, deleted_at on public.wishes
for each row execute function public.retire_closed_wish_tasks();

create or replace function public.guard_closed_wish_task() returns trigger
language plpgsql security definer set search_path = public
as $$ declare parent public.wishes; begin
  if new.related_wish_id is not null and new.completed = false and new.archived_at is null then
    select * into parent from public.wishes where id = new.related_wish_id for share;
    if parent.status <> 'public' or parent.is_active = false or parent.deleted_at is not null then
      new.archived_at := now();
      new.archived_by := auth.uid();
      new.archive_reason := 'wish_closed';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_closed_wish_task() from public, anon, authenticated;
create trigger guard_closed_wish_task before insert or update of related_wish_id, completed, archived_at on public.action_items
for each row execute function public.guard_closed_wish_task();

-- Recoverable consolidation of Nat's two short yarn duplicates into her full ask.
do $$ declare owner_id uuid; canonical_id uuid; old_ids uuid[]; begin
 select id into owner_id from public.profiles where email = 'natwalstead@gmail.com';
 select id into canonical_id from public.wishes where user_id=owner_id and deleted_at is null and status='public' and is_active=true
   and description like 'We''re doing ''Box o'' Beanies'' again this year%' order by created_at limit 1;
 select array_agg(id) into old_ids from public.wishes where user_id=owner_id and deleted_at is null
   and public.wish_text_key(description) in ('keepaneyeoutforcheapyarn','findusabunchofcheapyarn');
 if canonical_id is not null and cardinality(old_ids)>0 then
   update public.action_items set related_wish_id=canonical_id where related_wish_id=any(old_ids);
   -- Keep each person's completion history; retire redundant open copies only.
   update public.action_items pending set archived_at=now(), archived_by=owner_id, archive_reason='duplicate_wish_assignment'
   where pending.related_wish_id=canonical_id and not pending.completed and pending.archived_at is null
     and exists(select 1 from public.action_items other where other.related_wish_id=canonical_id
       and other.assigned_to=pending.assigned_to and other.id<>pending.id
       and public.wish_text_key(regexp_replace(other.description, '[(]re:[^)]*[)]', '', 'gi'))=public.wish_text_key(regexp_replace(pending.description, '[(]re:[^)]*[)]', '', 'gi'))
       and (other.completed or (not other.completed and other.archived_at is null and (other.created_at,other.id)<(pending.created_at,pending.id))));
   update public.wishes set deleted_at=now(),deleted_by=owner_id,is_active=false,is_spotlight=false where id=any(old_ids);
 end if;
end $$;
update public.action_items a set archived_at=now(), archive_reason='wish_closed'
from public.wishes w where a.related_wish_id=w.id and not a.completed and a.archived_at is null
and (w.status<>'public' or w.is_active=false or w.deleted_at is not null);

-- An atomic save reuses an existing ask and rejects a stale draft for a removed ask.
create or replace function public.file_check_in_wish(p_community_id uuid, p_description text, p_wish_id uuid default null, p_reach text default 'hive')
returns uuid language plpgsql security invoker set search_path=public
as $$ declare actor uuid:=auth.uid(); chosen uuid; k text:=public.wish_text_key(p_description); begin
 if actor is null or not public.is_community_member(p_community_id) then raise exception 'Choose a HIVE you belong to.' using errcode='42501'; end if;
 if coalesce(k,'')='' then raise exception 'Write your wish first.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||k,0));
 if p_wish_id is not null then
   select id into chosen from public.wishes where id=p_wish_id and user_id=actor and status='public' and is_active=true
     and deleted_at is null and (community_id=p_community_id or share_scope='all_hives');
   if chosen is null then raise exception 'The selected wish was closed or removed. Choose a new focus.' using errcode='22023'; end if;
 else
   select id into chosen from public.wishes where user_id=actor and public.wish_text_key(description)=k
     and status='public' and is_active=true and deleted_at is null and (community_id=p_community_id or share_scope='all_hives') order by created_at limit 1;
   if chosen is null and (
     exists(select 1 from public.wishes where user_id=actor and public.wish_text_key(description)=k and (status<>'public' or is_active=false))
     or exists(select 1 from public.community_memberships cm cross join lateral public.deleted_wishes(cm.community_id) d
       where cm.user_id=actor and d.user_id=actor and public.wish_text_key(d.description)=k)
   ) then raise exception 'This wish was closed or removed. Restore it from Removed wishes or write a new ask.' using errcode='22023'; end if;
 end if;
 update public.wishes set is_spotlight=false where user_id=actor and is_spotlight=true;
 if chosen is null then
   insert into public.wishes(user_id,community_id,description,raw_input,status,is_active,is_spotlight,share_scope,extracted_from)
   values(actor,p_community_id,trim(p_description),trim(p_description),'public',true,true,case when p_reach='all_hives' then 'all_hives' else 'hive' end,'onboarding') returning id into chosen;
 else update public.wishes set is_spotlight=true where id=chosen and user_id=actor;
 end if;
 return chosen;
end $$;
revoke all on function public.file_check_in_wish(uuid,text,uuid,text) from public, anon;
grant execute on function public.file_check_in_wish(uuid,text,uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.capture_meeting_jot(p_community_id uuid, p_about_user_id uuid, p_description text, p_assignee_ids uuid[], p_related_wish_id uuid, p_create_wish boolean, p_wish_title text, p_wish_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_capture_mode text;
  v_about_first text;
  v_wish_id uuid;
  v_created_wish_id uuid;
  v_wish_label text;
  v_comment_id uuid;
  v_action_item_ids uuid[] := '{}'::uuid[];
  v_requested_count integer;
  v_member_count integer;
begin
  if v_actor is null then
    raise exception 'Sign in before capturing a meeting jot.' using errcode = '42501';
  end if;

  if not public.is_community_admin(p_community_id) then
    raise exception 'A HIVE admin captures the meeting record.' using errcode = '42501';
  end if;

  select c.meeting_wish_capture_mode
    into v_capture_mode
  from public.communities c
  where c.id = p_community_id;

  if v_capture_mode is null then
    raise exception 'HIVE not found.' using errcode = '22023';
  end if;

  if p_create_wish and v_capture_mode <> 'automatic' then
    raise exception 'This HIVE reviews surfaced wishes before adding them.' using errcode = '42501';
  end if;

  if nullif(trim(p_description), '') is null
     or regexp_replace(
          regexp_replace(trim(p_description), '^(@[[:alnum:]_.-]+[[:space:],]*)+', '', 'i'),
          '[[:space:]]*[(]re:[^)]*[)][[:space:]]*$',
          '',
          'i'
        ) !~ '[[:alnum:]]' then
    raise exception 'A meeting jot needs a real action.' using errcode = '22023';
  end if;

  select split_part(trim(p.name), ' ', 1)
    into v_about_first
  from public.profiles p
  join public.community_memberships cm
    on cm.user_id = p.id and cm.community_id = p_community_id
  where p.id = p_about_user_id;

  if v_about_first is null then
    raise exception 'The person this jot is about is not in this HIVE.' using errcode = '22023';
  end if;

  select count(distinct requested.id)
    into v_requested_count
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) requested(id);

  select count(distinct cm.user_id)
    into v_member_count
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) requested(id)
  join public.community_memberships cm
    on cm.user_id = requested.id and cm.community_id = p_community_id;

  if v_requested_count = 0 or v_member_count <> v_requested_count then
    raise exception 'Every to-do assignee must be a current member of this HIVE.' using errcode = '22023';
  end if;

  if p_create_wish then
    if p_related_wish_id is not null then
      raise exception 'A new wish cannot also point at an existing wish.' using errcode = '22023';
    end if;
    if nullif(trim(p_wish_description), '') is null then
      raise exception 'A surfaced wish needs its own ask.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_about_user_id::text || public.wish_text_key(p_wish_description),0));
    select id into v_wish_id from public.wishes where user_id=p_about_user_id
      and community_id=p_community_id and deleted_at is null and status='public' and is_active=true
      and public.wish_text_key(description)=public.wish_text_key(p_wish_description) order by created_at limit 1;
    if v_wish_id is null and exists(select 1 from public.wishes where user_id=p_about_user_id
      and community_id=p_community_id and public.wish_text_key(description)=public.wish_text_key(p_wish_description)
      and (deleted_at is not null or status<>'public' or is_active=false)) then
      raise exception 'This wish was closed or removed. Restore it or write a new ask.' using errcode='22023';
    end if;
    if v_wish_id is null then
    insert into public.wishes (
      user_id,
      community_id,
      title,
      description,
      raw_input,
      status,
      share_scope,
      is_active,
      extracted_from
    ) values (
      p_about_user_id,
      p_community_id,
      nullif(trim(p_wish_title), ''),
      trim(p_wish_description),
      p_description,
      'public',
      'hive',
      true,
      'meeting'
    )
    returning id into v_wish_id;
    v_created_wish_id := v_wish_id;
    end if;
  elsif p_related_wish_id is not null then
    select w.id
      into v_wish_id
    from public.wishes w
    where w.id = p_related_wish_id
      and w.community_id = p_community_id
      and w.user_id = p_about_user_id
      and w.deleted_at is null
      and w.status = 'public'
      and coalesce(w.is_active, true);

    if v_wish_id is null then
      raise exception 'That wish is not an open wish for this person in this HIVE.' using errcode = '22023';
    end if;
  end if;

  if v_wish_id is not null then
    select v_about_first || '''s ' || coalesce(nullif(trim(w.title), ''), left(trim(w.description), 64))
      into v_wish_label
    from public.wishes w
    where w.id = v_wish_id;
  end if;

  with requested as (
    select distinct id
    from unnest(p_assignee_ids) member(id)
  ), inserted as (
    insert into public.action_items (
      description,
      assigned_to,
      community_id,
      related_user_id,
      related_wish_id
    )
    select
      case
        when requested.id = p_about_user_id then p_description
        when v_wish_id is not null then p_description || ' (re: ' || v_wish_label || ')'
        else p_description || ' (re: ' || v_about_first || ')'
      end,
      requested.id,
      p_community_id,
      p_about_user_id,
      v_wish_id
    from requested
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_action_item_ids
  from inserted;

  -- A note on an EXISTING wish is progress/context and belongs in that
  -- conversation. A brand-new wish already contains the ask, so copying the
  -- identical words into its comments would start it with a duplicate.
  if v_wish_id is not null and v_created_wish_id is null then
    insert into public.wish_comments (
      wish_id,
      user_id,
      community_id,
      content
    ) values (
      v_wish_id,
      v_actor,
      p_community_id,
      '📝 From the ' || to_char(timezone('America/Los_Angeles', now()), 'FMMonth') || ' meeting: ' || p_description
    )
    returning id into v_comment_id;
  end if;

  return jsonb_build_object(
    'wish_id', v_wish_id,
    'created_wish_id', v_created_wish_id,
    'comment_id', v_comment_id,
    'action_item_ids', to_jsonb(v_action_item_ids)
  );
end;
$function$


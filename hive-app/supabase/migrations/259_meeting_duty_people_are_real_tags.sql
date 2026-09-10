-- Meeting-summary people are controls over the real duty rows, not decorative
-- names at the end of a sentence. A HIVE admin can replace the assigned people
-- while the RPC keeps one underlying row per selected person. Spare rows are
-- retained unassigned so removing a mistaken tag preserves the meeting record.

create or replace function public.set_meeting_duty_owners(
  p_meeting_id uuid,
  p_action_item_ids uuid[],
  p_owner_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_actor uuid := auth.uid();
  v_requested uuid[];
  v_rows uuid[];
  v_row_count integer;
  v_index integer;
  v_template public.action_items%rowtype;
  v_new_id uuid;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select m.community_id into v_community_id
  from public.meetings m
  where m.id = p_meeting_id;

  if v_community_id is null or not public.is_community_admin(v_community_id) then
    raise exception 'Only a HIVE admin can change meeting duty tags.' using errcode = '42501';
  end if;

  select array_agg(x order by x) into v_rows
  from (select distinct unnest(coalesce(p_action_item_ids, '{}')) x) ids
  where exists (
    select 1 from public.action_items a
    where a.id = x and a.meeting_id = p_meeting_id and a.community_id = v_community_id
  );

  if coalesce(array_length(v_rows, 1), 0) <> coalesce(array_length(p_action_item_ids, 1), 0) then
    raise exception 'One or more duty rows do not belong to this meeting.' using errcode = '42501';
  end if;

  select array_agg(x order by x) into v_requested
  from (select distinct unnest(coalesce(p_owner_ids, '{}')) x) ids
  where exists (
    select 1 from public.community_memberships cm
    where cm.community_id = v_community_id and cm.user_id = x
  );

  if coalesce(array_length(v_requested, 1), 0) <> coalesce(array_length(p_owner_ids, 1), 0) then
    raise exception 'Every tagged person must belong to this HIVE.' using errcode = '42501';
  end if;

  select * into v_template
  from public.action_items a
  where a.id = any(v_rows)
  order by a.created_at, a.id
  limit 1;

  if not found then
    raise exception 'Duty not found.' using errcode = 'P0002';
  end if;

  v_row_count := coalesce(array_length(v_rows, 1), 0);
  while v_row_count < coalesce(array_length(v_requested, 1), 0) loop
    insert into public.action_items (
      meeting_id, description, assigned_to, due_date, completed, completed_at,
      community_id, related_wish_id, related_board_category_id, related_user_id,
      related_board_post_id, original_description, edited_at, edited_by
    ) values (
      p_meeting_id, v_template.description, null, v_template.due_date, false, null,
      v_community_id, v_template.related_wish_id, v_template.related_board_category_id,
      v_template.related_user_id, v_template.related_board_post_id,
      v_template.original_description, now(), v_actor
    ) returning id into v_new_id;
    v_rows := array_append(v_rows, v_new_id);
    v_row_count := v_row_count + 1;
  end loop;

  for v_index in 1..v_row_count loop
    update public.action_items
       set assigned_to = case
             when v_index <= coalesce(array_length(v_requested, 1), 0) then v_requested[v_index]
             else null
           end,
           edited_at = now(),
           edited_by = v_actor,
           archived_at = null,
           archived_by = null,
           archive_reason = null
     where id = v_rows[v_index];
  end loop;

  return jsonb_build_object(
    'action_item_ids', to_jsonb(v_rows),
    'owner_ids', to_jsonb(array(
      select a.assigned_to from unnest(v_rows) with ordinality ids(id, n)
      join public.action_items a on a.id = ids.id order by ids.n
    ))
  );
end;
$$;

grant execute on function public.set_meeting_duty_owners(uuid, uuid[], uuid[]) to authenticated;


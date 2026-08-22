begin;

-- A source discrepancy belongs where a HIVE admin sees it. Resolve the
-- warning and the authoritative to-do in one transaction so the summary can
-- never say one thing while a member's Home list says another.
create or replace function public.resolve_meeting_summary_conflict(
  p_meeting_id uuid,
  p_conflict_id text,
  p_resolution text,
  p_new_owner_id uuid default null,
  p_note text default null,
  p_next_summary jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_community_id uuid;
  v_summary jsonb;
  v_conflict jsonb;
  v_review jsonb;
  v_action_item_id uuid;
  v_previous_owner_id uuid;
  v_previous_owner_name text;
  v_new_owner_name text;
  v_task_description text;
  v_resolution_record jsonb;
  v_next_summary jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in before resolving a meeting review.' using errcode = '42501';
  end if;

  if nullif(trim(p_conflict_id), '') is null then
    raise exception 'A review id is required.' using errcode = '22023';
  end if;

  if p_resolution not in ('keep_owner', 'reassign', 'remove', 'clarify') then
    raise exception 'Choose keep_owner, reassign, remove, or clarify.' using errcode = '22023';
  end if;

  select m.community_id, m.summary::jsonb
    into v_community_id, v_summary
  from public.meetings m
  where m.id = p_meeting_id
  for update;

  if v_community_id is null then
    raise exception 'Meeting not found.' using errcode = '22023';
  end if;

  if not public.is_community_admin(v_community_id) then
    raise exception 'A HIVE admin resolves the shared meeting record.' using errcode = '42501';
  end if;

  select conflict_group
    into v_conflict
  from jsonb_array_elements(coalesce(v_summary->'sections', '[]'::jsonb)) as section_row(section_value)
  cross join lateral jsonb_array_elements(coalesce(section_row.section_value->'groups', '[]'::jsonb)) as group_row(conflict_group)
  where section_row.section_value->>'title' = 'Needs Review'
    and group_row.conflict_group->'review'->>'conflict_id' = p_conflict_id
  limit 1;

  if v_conflict is null then
    raise exception 'That review has already been resolved or is no longer current.' using errcode = '22023';
  end if;

  v_review := v_conflict->'review';
  v_task_description := nullif(v_review->>'task_description', '');
  if nullif(v_review->>'action_item_id', '') is not null then
    v_action_item_id := (v_review->>'action_item_id')::uuid;
  end if;

  if p_resolution <> 'clarify' and v_action_item_id is null then
    raise exception 'This review is not linked to a current to-do. Record a clarification instead.' using errcode = '22023';
  end if;

  if v_action_item_id is not null then
    select ai.assigned_to, ai.description, p.name
      into v_previous_owner_id, v_task_description, v_previous_owner_name
    from public.action_items ai
    left join public.profiles p on p.id = ai.assigned_to
    where ai.id = v_action_item_id
      and ai.community_id = v_community_id
      and ai.archived_at is null
    for update of ai;

    if not found then
      raise exception 'The linked to-do is no longer current. Reload this summary before resolving it.' using errcode = '22023';
    end if;
  end if;

  if p_resolution = 'reassign' then
    if p_new_owner_id is null then
      raise exception 'Choose who should own this duty.' using errcode = '22023';
    end if;

    select p.name
      into v_new_owner_name
    from public.community_memberships cm
    join public.profiles p on p.id = cm.user_id
    where cm.community_id = v_community_id
      and cm.user_id = p_new_owner_id;

    if v_new_owner_name is null then
      raise exception 'The new owner must belong to this HIVE.' using errcode = '22023';
    end if;

    update public.action_items
    set assigned_to = p_new_owner_id,
        edited_at = now(),
        edited_by = v_actor
    where id = v_action_item_id;
  elsif p_resolution = 'remove' then
    update public.action_items
    set archived_at = now(),
        archived_by = v_actor,
        archive_reason = 'resolved_from_meeting_summary_review'
    where id = v_action_item_id;
  elsif p_resolution = 'keep_owner' then
    v_new_owner_name := v_previous_owner_name;
  elsif nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Write the corrected record before saving this review.' using errcode = '22023';
  end if;

  if p_next_summary is null or jsonb_typeof(p_next_summary) <> 'object' then
    raise exception 'The reviewed summary is required.' using errcode = '22023';
  end if;

  if p_next_summary->>'source' is distinct from v_summary->>'source'
     or p_next_summary->>'title' is distinct from v_summary->>'title'
     or p_next_summary->'meeting_helper_snapshot' is distinct from v_summary->'meeting_helper_snapshot' then
    raise exception 'The review may not replace the meeting source record.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next_summary->'sections', '[]'::jsonb)) as section_row(section_value)
    cross join lateral jsonb_array_elements(coalesce(section_row.section_value->'groups', '[]'::jsonb)) as group_row(conflict_group)
    where group_row.conflict_group->'review'->>'conflict_id' = p_conflict_id
  ) then
    raise exception 'The resolved review is still present in the replacement summary.' using errcode = '22023';
  end if;

  v_resolution_record := jsonb_strip_nulls(jsonb_build_object(
    'conflict_id', p_conflict_id,
    'topic', v_conflict->>'title',
    'resolution', p_resolution,
    'action_item_id', v_action_item_id,
    'task_description', v_task_description,
    'previous_owner_id', v_previous_owner_id,
    'previous_owner_name', v_previous_owner_name,
    'new_owner_id', case when p_resolution = 'reassign' then p_new_owner_id else v_previous_owner_id end,
    'new_owner_name', case when p_resolution = 'reassign' then v_new_owner_name when p_resolution = 'keep_owner' then v_previous_owner_name else null end,
    'note', nullif(trim(coalesce(p_note, '')), ''),
    'resolved_by', v_actor,
    'resolved_at', now()
  ));

  v_next_summary := jsonb_set(
    p_next_summary,
    '{conflict_resolutions}',
    coalesce(v_summary->'conflict_resolutions', '[]'::jsonb) || jsonb_build_array(v_resolution_record),
    true
  );

  update public.meetings
  set summary = v_next_summary::text
  where id = p_meeting_id;

  return v_resolution_record;
end;
$$;

revoke all on function public.resolve_meeting_summary_conflict(uuid, text, text, uuid, text, jsonb) from public;
grant execute on function public.resolve_meeting_summary_conflict(uuid, text, text, uuid, text, jsonb) to authenticated;

comment on function public.resolve_meeting_summary_conflict(uuid, text, text, uuid, text, jsonb) is
  'Atomically resolves an inline meeting-summary discrepancy and its linked authoritative to-do while preserving a human review receipt.';

-- Establish the August OG meeting as the first actionable reference result.
-- This adds a machine-readable pointer only; no source wording, transcript,
-- duty, owner, or rebuild history is changed.
do $$
declare
  v_meeting_id uuid := '72f25bd8-bf64-497e-99a9-571da8f55674';
  v_summary jsonb;
  v_section_index integer;
  v_group_index integer;
begin
  select summary::jsonb into v_summary
  from public.meetings
  where id = v_meeting_id;

  if v_summary->'reference_result'->>'name' = 'August 2026 OG HIVE source-reconciled reference' then
    select (section_row.ordinality - 1)::integer
      into v_section_index
    from jsonb_array_elements(v_summary->'sections') with ordinality as section_row(section_value, ordinality)
    where section_row.section_value->>'title' = 'Needs Review'
    limit 1;

    if v_section_index is not null then
      select (group_row.ordinality - 1)::integer
        into v_group_index
      from jsonb_array_elements(v_summary->'sections'->v_section_index->'groups') with ordinality as group_row(group_value, ordinality)
      where group_row.group_value->>'title' = 'Body-double owner'
      limit 1;
    end if;

    if v_group_index is not null
       and v_summary->'sections'->v_section_index->'groups'->v_group_index->'review' is null then
      v_summary := jsonb_set(
        v_summary,
        array['sections', v_section_index::text, 'groups', v_group_index::text, 'review'],
        jsonb_build_object(
          'kind', 'action_item_owner',
          'conflict_id', 'action-item-owner:ab6ed8d8-881d-4e8c-bd52-61b34bb79cc4',
          'action_item_id', 'ab6ed8d8-881d-4e8c-bd52-61b34bb79cc4',
          'task_description', 'body double',
          'current_owner_id', '438ba5db-a064-4eba-b022-8c1ba3595f9d',
          'current_owner_name', 'Meghan',
          'summary_line', 'Confirmed duty: Body-double with Meghan while she works through website language — Meghan'
        ),
        true
      );

      update public.meetings
      set summary = v_summary::text
      where id = v_meeting_id;
    end if;
  end if;
end;
$$;

commit;

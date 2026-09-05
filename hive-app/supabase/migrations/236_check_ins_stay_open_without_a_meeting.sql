-- A reminder needs a date. A member's thought does not.
-- Let Before we meet keep one durable "next meeting" receipt while a HIVE has
-- no scheduled meeting. The screen carries it forward when a meeting is added.
create or replace function public.save_check_in_occurrence(
  p_survey_id uuid, p_community_id uuid, p_occurrence text, p_answers jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_kind text;
  v_period text;
  v_response public.survey_responses;
  v_next_occurrence text := 'next:' || coalesce(p_community_id::text, '');
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be an object' using errcode = '22023';
  end if;
  select public.check_in_kind(s.title) into v_kind from public.surveys s
    where s.id = p_survey_id and s.is_active and s.community_id is null;
  if v_kind is null or v_kind not in ('premeeting', 'endofmonth') then
    raise exception 'No active staple check-in' using errcode = '42501';
  end if;
  if p_community_id is not null and not exists (
    select 1 from public.community_memberships m
    where m.user_id = v_user and m.community_id = p_community_id
  ) then
    raise exception 'Not a member of this HIVE' using errcode = '42501';
  end if;

  if v_kind = 'premeeting' then
    select to_char(e.event_date, 'YYYY-MM') into v_period from public.events e
      where 'meeting:' || e.id::text = p_occurrence
      and e.community_id = p_community_id
      and e.event_type = 'meeting' and e.status = 'scheduled'
      and e.event_date >= (now() at time zone 'America/Los_Angeles')::date;

    if v_period is null and p_occurrence = v_next_occurrence and not exists (
      select 1 from public.events e
      where e.community_id = p_community_id
      and e.event_type = 'meeting' and e.status = 'scheduled'
      and e.event_date >= (now() at time zone 'America/Los_Angeles')::date
    ) then
      v_period := to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM');
    end if;

    if v_period is null then
      raise exception 'No matching upcoming meeting' using errcode = '42501';
    end if;

    -- The undated drawer belongs to the first meeting that follows it. Keep the
    -- receipt, but move it out of the reusable `next:` slot when that meeting is
    -- saved so it cannot spill into every later meeting.
    if p_occurrence like 'meeting:%' then
      update public.check_in_completions
        set occurrence = 'carried-to:' || substring(p_occurrence from 9)
        where survey_id = p_survey_id
          and user_id = v_user
          and community_id = p_community_id
          and occurrence = v_next_occurrence;
    end if;
  else
    v_period := to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM');
    if p_occurrence is distinct from 'month:' || v_period then
      raise exception 'Not the current month' using errcode = '42501';
    end if;
  end if;

  insert into public.survey_responses
    (survey_id, user_id, community_id, response_period, answers, submitted_at)
    values (p_survey_id, v_user, p_community_id, v_period, p_answers, now())
    on conflict (survey_id, user_id, response_period, community_key)
    do update set answers = excluded.answers, submitted_at = excluded.submitted_at
    returning * into v_response;
  insert into public.check_in_completions
    (survey_id, user_id, community_id, occurrence, answers, completed_at)
    values (p_survey_id, v_user, p_community_id, p_occurrence, p_answers, now())
    on conflict (survey_id, user_id, community_key, occurrence)
    do update set answers = excluded.answers, completed_at = excluded.completed_at;
  return to_jsonb(v_response);
end;
$$;
revoke all on function public.save_check_in_occurrence(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.save_check_in_occurrence(uuid, uuid, text, jsonb) to authenticated;

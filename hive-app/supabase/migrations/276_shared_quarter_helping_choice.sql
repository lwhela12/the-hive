-- Both quarter choices now live in one shared monthly answer. Keep each
-- meeting's tally limited to its own member roster and retain OG's older
-- scoped helping answer as a fallback for historical reviews.
begin;

create or replace function public.quarter_pulse_summary(
  p_community_id uuid, p_period text
) returns table(question_id text, option text, response_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_slug text;
  v_survey_id uuid;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid response period' using errcode = '22023';
  end if;
  select c.slug into v_slug from public.communities c
    where c.id = p_community_id;
  if v_slug is null or v_slug not in ('default', 'tech') then
    raise exception 'This HIVE has no pulse summary' using errcode = '42501';
  end if;
  if not public.is_hive_owner() and not exists (
    select 1 from public.community_memberships m
    where m.community_id = p_community_id and m.user_id = v_caller
  ) then
    raise exception 'HIVE membership required' using errcode = '42501';
  end if;
  select s.id into v_survey_id from public.surveys s
    where s.community_id is null and s.is_active
      and public.check_in_kind(s.title) = 'endofmonth'
    order by s.created_at desc limit 1;
  if v_survey_id is null then return; end if;

  return query
  with choices(qid, choice) as (
    values
      ('q_quarter_helping', 'Yes'),
      ('q_quarter_helping', 'A little'),
      ('q_quarter_helping', 'Not yet'),
      ('q_quarter_helping', 'Not sure'),
      ('q_quarter_help_next', 'A gentle nudge'),
      ('q_quarter_help_next', 'Time to work together'),
      ('q_quarter_help_next', 'Ideas or connections'),
      ('q_quarter_help_next', 'More connection and fun'),
      ('q_quarter_help_next', 'Something else'),
      ('q_quarter_help_next', 'Nothing extra right now')
  ), eligible as (
    select distinct m.user_id from public.community_memberships m
    where m.community_id = p_community_id
  ), scoped as (
    select distinct on (r.user_id) r.user_id, r.answers
    from public.survey_responses r join eligible e on e.user_id = r.user_id
    where r.survey_id = v_survey_id and r.community_id = p_community_id
      and r.response_period = p_period
    order by r.user_id, r.submitted_at desc, r.id desc
  ), shared as (
    select distinct on (r.user_id) r.user_id, r.answers
    from public.survey_responses r join eligible e on e.user_id = r.user_id
    where r.survey_id = v_survey_id and r.community_id is null
      and r.response_period = p_period
    order by r.user_id, r.submitted_at desc, r.id desc
  ), answers as (
    select e.user_id,
      coalesce(s.answers ->> 'q_quarter_helping',
        case when v_slug = 'default' then h.answers ->> 'q_quarter_helping' end) as helping,
      coalesce(s.answers ->> 'q_quarter_help_next',
        case when v_slug = 'default' then h.answers ->> 'q_quarter_help_next' end) as support
    from eligible e left join scoped h on h.user_id = e.user_id
      left join shared s on s.user_id = e.user_id
  )
  select ch.qid, ch.choice,
    count(a.user_id) filter (where
      (ch.qid = 'q_quarter_helping' and a.helping = ch.choice) or
      (ch.qid = 'q_quarter_help_next' and a.support = ch.choice))
    from choices ch left join answers a on true
    group by ch.qid, ch.choice;
end;
$$;

commit;

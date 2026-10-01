-- Survey words belong to their author and the HIVE owners. Members receive
-- scoped counts through narrow functions, never another person's answer row.
-- No response, receipt, or history data is rewritten by this migration.
begin;

do $$
declare
  v_response_select text;
  v_receipt_select text;
  v_history_select text;
begin
  if (select md5(c.relacl::text) from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'survey_responses')
      is distinct from '46875263bd6598c4534e2df7d1847a5e' or
     (select md5(c.relacl::text) from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'check_in_completions')
      is distinct from '46d83234770ac4adefe1617d8dc0e51f' or
     (select md5(c.relacl::text) from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'check_in_answer_history')
      is distinct from '0382c9d760805ac4a3cfd8d6ca8a6951' then
    raise exception 'Check-in table grants changed; review before tightening them';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'survey_responses') <> 4 then
    raise exception 'Survey response policy set changed; review before restricting reads';
  end if;
  select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
    into v_response_select from pg_policies where schemaname = 'public'
    and tablename = 'survey_responses' and cmd = 'SELECT';
  if v_response_select is distinct from '933cc9d62106cc9a72bcf3cdc70e592c' then
    raise exception 'Survey response SELECT policy changed; review before replacing it';
  end if;
  if (select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
      from pg_policies where schemaname = 'public' and tablename = 'survey_responses'
      and cmd = 'INSERT') is distinct from 'af836ef4b39b72c6d173e295f898d933' or
     (select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
      from pg_policies where schemaname = 'public' and tablename = 'survey_responses'
      and cmd = 'UPDATE' and policyname = 'Users can update own responses')
      is distinct from '91fbf3e7be745cfcf15574ba18482c29' or
     (select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
      from pg_policies where schemaname = 'public' and tablename = 'survey_responses'
      and cmd = 'UPDATE' and policyname = 'owners edit newsletter survey contributions')
      is distinct from 'a8108bc2eb6273478808f9b2421884d5' then
    raise exception 'Survey answer write policies changed; review before changing grants';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'check_in_completions') <> 3 then
    raise exception 'Check-in receipt policy set changed; review before changing grants';
  end if;
  select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
    into v_receipt_select from pg_policies where schemaname = 'public'
    and tablename = 'check_in_completions' and cmd = 'SELECT';
  if v_receipt_select is distinct from '601329c88007b55a3cf642c8ece837ec' then
    raise exception 'Check-in receipt SELECT policy changed; review before changing grants';
  end if;
  if (select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
      from pg_policies where schemaname = 'public' and tablename = 'check_in_completions'
      and cmd = 'INSERT') is distinct from 'b3828a0fccfdf59e2100ba687411e57f' or
     (select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
      from pg_policies where schemaname = 'public' and tablename = 'check_in_completions'
      and cmd = 'UPDATE') is distinct from '5499e7e8a3429afb58161a66c7716cc0' then
    raise exception 'Check-in receipt write policies changed; review before changing grants';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'check_in_answer_history') <> 1 then
    raise exception 'Answer-history policy set changed; review before changing grants';
  end if;
  select md5(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check))
    into v_history_select from pg_policies where schemaname = 'public'
    and tablename = 'check_in_answer_history' and cmd = 'SELECT';
  if v_history_select is distinct from '294dede5eeb31d77690afa36e4957597' then
    raise exception 'Answer-history SELECT policy changed; review before changing grants';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in
      ('survey_responses', 'check_in_completions', 'check_in_answer_history')
      and not c.relrowsecurity) then
    raise exception 'A check-in answer table has RLS disabled';
  end if;
  if md5(pg_get_functiondef('public.save_check_in_occurrence(uuid,uuid,text,jsonb)'::regprocedure))
      is distinct from 'f9e42358b7a5312258b18ad6c5fee4f4' then
    raise exception 'The atomic check-in save function changed; review grants before continuing';
  end if;
end;
$$;

drop policy "Survey responses viewable by scope" on public.survey_responses;
create policy "Survey answers belong to authors and owners"
  on public.survey_responses for select to authenticated
  using (user_id = auth.uid() or public.is_hive_owner());

-- RLS does not guard TRUNCATE, TRIGGER, or MAINTAIN. The live table grants
-- included all of them for anon and authenticated, so reset table privileges
-- to the operations the app actually needs. The security-definer save RPC
-- keeps writing receipts atomically under its own validated contract.
revoke all on table public.survey_responses from public, anon, authenticated;
grant select, insert, update on table public.survey_responses to authenticated;
revoke all on table public.check_in_completions from public, anon, authenticated;
grant select on table public.check_in_completions to authenticated;
revoke all on table public.check_in_answer_history from public, anon, authenticated;
grant select on table public.check_in_answer_history to authenticated;

create function public.survey_submission_counts(
  p_survey_id uuid, p_community_id uuid, p_period text
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_survey_community uuid;
  v_period_count bigint;
  v_default_count bigint;
  v_total_count bigint;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_period is null or (p_period <> 'default' and
      p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') then
    raise exception 'Invalid response period' using errcode = '22023';
  end if;
  select s.community_id into v_survey_community from public.surveys s
    where s.id = p_survey_id;
  if not found or (v_survey_community is not null and
      v_survey_community is distinct from p_community_id) then
    raise exception 'Survey unavailable in this HIVE' using errcode = '42501';
  end if;
  if (p_community_id is null and v_survey_community is not null)
      or (not public.is_hive_owner() and not exists (
        select 1 from public.community_memberships m
        where m.user_id = v_caller and
          (p_community_id is null or m.community_id = p_community_id)
      )) then
    raise exception 'HIVE membership required' using errcode = '42501';
  end if;

  with eligible as (
    select distinct m.user_id from public.community_memberships m
    where p_community_id is null or m.community_id = p_community_id
  )
  select count(distinct r.user_id) filter (where r.response_period = p_period),
    count(distinct r.user_id) filter (where r.response_period = 'default'),
    count(distinct r.user_id)
    into v_period_count, v_default_count, v_total_count
    from public.survey_responses r join eligible e on e.user_id = r.user_id
    where r.survey_id = p_survey_id and (
      (v_survey_community is null and
        ((p_community_id is null and r.community_id is null) or
          (p_community_id is not null and
            (r.community_id is null or r.community_id = p_community_id))))
      or (v_survey_community is not null and r.community_id = p_community_id)
    );
  return jsonb_build_object('period_count', v_period_count,
    'default_count', v_default_count, 'total_count', v_total_count);
end;
$$;
revoke all on function public.survey_submission_counts(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.survey_submission_counts(uuid,uuid,text)
  to authenticated;

-- Fixed choice keys only. A caller cannot use this function to ask for free
-- text, identities, Production responses, or a different HIVE's breakdown.
create function public.quarter_pulse_summary(
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
      h.answers ->> 'q_quarter_helping' as helping,
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
    where ch.qid = 'q_quarter_help_next' or v_slug = 'default'
    group by ch.qid, ch.choice;
end;
$$;
revoke all on function public.quarter_pulse_summary(uuid,text)
  from public, anon, authenticated;
grant execute on function public.quarter_pulse_summary(uuid,text)
  to authenticated;

commit;

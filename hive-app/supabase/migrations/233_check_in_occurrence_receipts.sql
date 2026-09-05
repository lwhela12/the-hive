-- Additive; deploy only after review. No schedule or mail is enabled here.
-- Keep historical meeting answers even when the legacy monthly reader advances.
-- Snapshot first, before any canonical overwrite. No inferred meeting identity.
create table public.check_in_answer_history (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null,
  survey_id uuid not null,
  user_id uuid not null,
  community_id uuid,
  response_period text,
  submitted_at timestamptz,
  answers jsonb not null,
  original_row jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.check_in_answer_history enable row level security;
create policy "Read own original check-in answers" on public.check_in_answer_history
  for select to authenticated using (user_id = auth.uid());
revoke all on public.check_in_answer_history from public, anon, authenticated;
grant select on public.check_in_answer_history to authenticated;
-- Block concurrent legacy writes during snapshot/trigger installation.
lock table public.survey_responses in share row exclusive mode;
insert into public.check_in_answer_history
  (response_id, survey_id, user_id, community_id, response_period, submitted_at, answers, original_row)
select r.id, r.survey_id, r.user_id, r.community_id, r.response_period, r.submitted_at, r.answers, to_jsonb(r)
from public.survey_responses r join public.surveys s on s.id = r.survey_id
where s.community_id is null and public.check_in_kind(s.title) in ('premeeting', 'endofmonth');
create function public.archive_check_in_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.survey_responses;
begin
  if TG_OP = 'INSERT' then r := new; else r := old; end if;
  if exists (select 1 from public.surveys s where s.id = r.survey_id
    and s.community_id is null and public.check_in_kind(s.title) in ('premeeting', 'endofmonth')) then
    insert into public.check_in_answer_history
      (response_id, survey_id, user_id, community_id, response_period, submitted_at, answers, original_row)
    values (r.id, r.survey_id, r.user_id, r.community_id, r.response_period, r.submitted_at, r.answers, to_jsonb(r));
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.archive_check_in_answer() from public, anon, authenticated;
create trigger preserve_check_in_answer before insert or update or delete on public.survey_responses
  for each row execute function public.archive_check_in_answer();
create table public.check_in_completions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id),
  user_id uuid not null references public.profiles(id),
  community_id uuid references public.communities(id),
  community_key text generated always as (coalesce(community_id::text, '')) stored,
  occurrence text not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  completed_at timestamptz not null default now(),
  unique(survey_id, user_id, community_key, occurrence)
);
alter table public.check_in_completions enable row level security;
create policy "Read own check-in receipts" on public.check_in_completions for select to authenticated using (user_id = auth.uid());
create policy "File own check-in receipts" on public.check_in_completions for insert to authenticated with check (
  user_id = auth.uid()
  and exists(
    select 1 from public.surveys s
    where s.id = check_in_completions.survey_id and s.is_active and s.community_id is null
    and (
      (public.check_in_kind(s.title) = 'premeeting'
        and exists(select 1 from public.events e
          where 'meeting:' || e.id::text = check_in_completions.occurrence
          and e.community_id = check_in_completions.community_id
          and e.event_type = 'meeting' and e.status = 'scheduled'
          and e.event_date >= (now() at time zone 'America/Los_Angeles')::date))
      or (public.check_in_kind(s.title) = 'endofmonth'
        and check_in_completions.occurrence = 'month:' || to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM'))
    )
  )
  and (community_id is null or exists(select 1 from public.community_memberships m where m.user_id = auth.uid() and m.community_id = check_in_completions.community_id))
);
create policy "Revise own check-in receipts" on public.check_in_completions for update to authenticated using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists(
    select 1 from public.surveys s
    where s.id = check_in_completions.survey_id and s.is_active and s.community_id is null
    and (
      (public.check_in_kind(s.title) = 'premeeting'
        and exists(select 1 from public.events e
          where 'meeting:' || e.id::text = check_in_completions.occurrence
          and e.community_id = check_in_completions.community_id
          and e.event_type = 'meeting' and e.status = 'scheduled'
          and e.event_date >= (now() at time zone 'America/Los_Angeles')::date))
      or (public.check_in_kind(s.title) = 'endofmonth'
        and check_in_completions.occurrence = 'month:' || to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM'))
    )
  )
  and (community_id is null or exists(select 1 from public.community_memberships m where m.user_id = auth.uid() and m.community_id = check_in_completions.community_id))
);
-- The receipt is not independently writable: completion and the canonical
-- monthly response must commit together. No client-supplied user or period.
revoke insert, update, delete on public.check_in_completions from public, anon, authenticated;

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
    if v_period is null then
      raise exception 'No matching upcoming meeting' using errcode = '42501';
    end if;
  else
    v_period := to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM');
    if p_occurrence is distinct from 'month:' || v_period then
      raise exception 'Not the current month' using errcode = '42501';
    end if;
  end if;

  -- Upsert preserves the existing canonical response id and other metadata.
  -- Its row lock serializes competing saves through the receipt write too.
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

-- Persistent at-most-once claims: concurrent presses must not send twice.
-- Failed/ambiguous deliveries stay claimed for owner review, never auto-replayed.
create table public.check_in_reminder_receipts (
  dedupe_key text primary key,
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  sent boolean not null default false,
  reason text
);
alter table public.check_in_reminder_receipts enable row level security;
-- Service role only. Intentionally no member policies and no delete paths.

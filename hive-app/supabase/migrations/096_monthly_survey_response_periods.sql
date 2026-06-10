-- Keep standing monthly check-ins reusable without overwriting prior months.

alter table public.survey_responses
  add column if not exists response_period text;

update public.survey_responses sr
set response_period = case
  when sr.response_period is not null and sr.response_period <> '' then sr.response_period
  when concat_ws(' ', s.title, s.description) ~* 'monthly[[:space:]]+check-?in'
    then case
      when s.due_date is not null
        and sr.submitted_at >= date_trunc('day', s.due_date) - interval '3 days'
        then to_char(s.due_date, 'YYYY-MM')
      else to_char(sr.submitted_at, 'YYYY-MM')
    end
  else 'default'
end
from public.surveys s
where s.id = sr.survey_id
  and (
    sr.response_period is null
    or sr.response_period = ''
  );

alter table public.survey_responses
  alter column response_period set default 'default',
  alter column response_period set not null;

alter table public.survey_responses
  drop constraint if exists survey_responses_survey_id_user_id_key;

create unique index if not exists survey_responses_survey_user_period_idx
  on public.survey_responses(survey_id, user_id, response_period);

comment on column public.survey_responses.response_period is
  'Logical response cycle. Monthly Check-in uses YYYY-MM so the standing survey can be answered every month without overwriting prior check-ins.';

-- Track the actual daily-question date so members can catch up on missed days.

alter table public.daily_question_answers
  add column if not exists question_date date;

update public.daily_question_answers
set question_date = created_at::date
where question_date is null;

alter table public.daily_question_answers
  alter column question_date set not null;

alter table public.daily_question_answers
  alter column question_date set default current_date;

alter table public.daily_question_answers
  drop constraint if exists daily_question_answers_user_id_question_index_key;

create unique index if not exists daily_question_answers_user_date_idx
  on public.daily_question_answers(user_id, question_date);

create index if not exists daily_question_answers_community_date_idx
  on public.daily_question_answers(community_id, question_date);

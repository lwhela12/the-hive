-- Daily question answers
-- question_index maps to the index in DAILY_QUESTIONS array in lib/dailyQuestions.ts
-- One row per user per question (unique constraint prevents duplicates)

create table public.daily_question_answers (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  community_id uuid not null,
  question_index integer not null,
  answer text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, question_index)
);

alter table public.daily_question_answers enable row level security;

create policy "Answers viewable by authenticated members"
  on public.daily_question_answers for select
  using (auth.role() = 'authenticated');

create policy "Users can insert own answers"
  on public.daily_question_answers for insert
  with check (auth.uid() = user_id);

create policy "Users can update own answers"
  on public.daily_question_answers for update
  using (auth.uid() = user_id);

-- Index for fetching all answers for a given question in a community
create index daily_question_answers_community_question_idx
  on public.daily_question_answers(community_id, question_index);

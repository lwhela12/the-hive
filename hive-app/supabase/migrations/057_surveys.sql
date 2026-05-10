-- In-app surveys: admin creates, members respond, Clive has full context

create table public.surveys (
  id uuid default uuid_generate_v4() primary key,
  community_id uuid not null,
  title text not null,
  description text,
  -- questions: [{ id, text, type: 'short'|'long'|'scale'|'choice', options?: string[], required: boolean }]
  questions jsonb not null default '[]',
  due_date timestamptz,
  meeting_id uuid references public.meetings(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  is_active boolean default true
);

create table public.survey_responses (
  id uuid default uuid_generate_v4() primary key,
  survey_id uuid references public.surveys(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  community_id uuid not null,
  -- answers: { [question_id]: string | string[] | number }
  answers jsonb not null default '{}',
  submitted_at timestamptz default now(),
  unique(survey_id, user_id)
);

alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;

-- All authenticated members can read surveys for their community
create policy "Surveys viewable by community members"
  on public.surveys for select
  using (auth.role() = 'authenticated');

-- Admins can create/update/delete surveys
create policy "Admins can manage surveys"
  on public.surveys for all
  using (
    exists (
      select 1 from public.community_memberships
      where user_id = auth.uid()
        and community_id = surveys.community_id
        and role in ('admin', 'treasurer')
    )
  );

-- Members can read all responses (transparency) and manage their own
create policy "Survey responses viewable by community"
  on public.survey_responses for select
  using (auth.role() = 'authenticated');

create policy "Users can submit own responses"
  on public.survey_responses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own responses"
  on public.survey_responses for update
  using (auth.uid() = user_id);

-- Indexes for common queries
create index surveys_community_active_idx on public.surveys(community_id, is_active, due_date);
create index survey_responses_survey_user_idx on public.survey_responses(survey_id, user_id);
create index survey_responses_user_idx on public.survey_responses(user_id, community_id);

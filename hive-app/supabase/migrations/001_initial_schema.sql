-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ENUM types
create type user_role as enum ('member', 'treasurer', 'admin');
create type wish_status as enum ('private', 'public', 'fulfilled', 'replaced');
create type queen_bee_status as enum ('upcoming', 'active', 'completed');
create type event_type as enum ('meeting', 'queen_bee', 'birthday', 'custom');
create type notification_type as enum ('wish_match', 'meeting_summary', 'queen_bee_update', 'action_item', 'general');
create type extraction_source as enum ('chat', 'onboarding', 'meeting', 'manual');

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  phone text,
  preferred_contact text default 'email',
  birthday date,
  role user_role default 'member',
  queen_bee_month text, -- Format: '2025-03'
  google_calendar_id text,
  google_refresh_token text, -- Encrypted
  avatar_url text,
  onboarded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Skills (user capabilities, HD articulated)
create table public.skills (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  description text not null, -- HD articulated version
  raw_input text, -- What they originally said
  extracted_from extraction_source default 'chat',
  created_at timestamptz default now()
);

-- Wishes
create table public.wishes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  description text not null, -- HD articulated version
  raw_input text, -- Original problem/desire
  status wish_status default 'private',
  is_active boolean default false, -- Only one active public wish per user
  extracted_from extraction_source default 'chat',
  fulfilled_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  fulfilled_at timestamptz,
  replaced_at timestamptz
);

-- Queen Bee periods
create table public.queen_bees (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  month text not null unique, -- Format: '2025-03'
  project_title text not null,
  project_description text,
  status queen_bee_status default 'upcoming',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Queen Bee updates (from QB or other members)
create table public.queen_bee_updates (
  id uuid default uuid_generate_v4() primary key,
  queen_bee_id uuid references public.queen_bees(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- Meetings
create table public.meetings (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  audio_url text, -- Supabase Storage path
  transcript_raw text, -- Full text with speaker labels
  transcript_attributed text, -- Cleaned with names
  summary text, -- AI-generated
  recorded_by uuid references public.profiles(id),
  processing_status text default 'pending', -- pending, transcribing, summarizing, complete, failed
  created_at timestamptz default now()
);

-- Meeting action items
create table public.action_items (
  id uuid default uuid_generate_v4() primary key,
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  description text not null,
  assigned_to uuid references public.profiles(id),
  due_date date,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Honey Pot (community fund)
create table public.honey_pot (
  id uuid default uuid_generate_v4() primary key,
  balance decimal(10,2) default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- Honey Pot transactions
create table public.honey_pot_transactions (
  id uuid default uuid_generate_v4() primary key,
  amount decimal(10,2) not null,
  transaction_type text not null, -- 'deposit', 'withdrawal', 'adjustment'
  note text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Calendar events
create table public.events (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  event_date date not null,
  event_time time,
  event_type event_type default 'custom',
  google_event_id text, -- For sync
  related_user_id uuid references public.profiles(id), -- For birthdays
  related_queen_bee_id uuid references public.queen_bees(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Notifications
create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  notification_type notification_type not null,
  title text not null,
  content text,
  related_wish_id uuid references public.wishes(id),
  related_meeting_id uuid references public.meetings(id),
  related_action_item_id uuid references public.action_items(id),
  read_at timestamptz,
  email_sent boolean default false,
  created_at timestamptz default now()
);

-- Chat history (for context)
create table public.chat_messages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null, -- 'user' or 'assistant'
  content text not null,
  tool_calls jsonb, -- Store any tool calls made
  created_at timestamptz default now()
);

-- Row Level Security Policies
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.wishes enable row level security;
alter table public.queen_bees enable row level security;
alter table public.queen_bee_updates enable row level security;
alter table public.meetings enable row level security;
alter table public.action_items enable row level security;
alter table public.honey_pot enable row level security;
alter table public.honey_pot_transactions enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles: Users can read all, update own
create policy "Profiles are viewable by authenticated users" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Skills: Users can read all, manage own
create policy "Skills are viewable by authenticated users" on public.skills
  for select using (auth.role() = 'authenticated');
create policy "Users can insert own skills" on public.skills
  for insert with check (auth.uid() = user_id);
create policy "Users can update own skills" on public.skills
  for update using (auth.uid() = user_id);
create policy "Users can delete own skills" on public.skills
  for delete using (auth.uid() = user_id);

-- Wishes: Users can read public wishes and own private wishes
create policy "Users can read public wishes" on public.wishes
  for select using (status = 'public' or auth.uid() = user_id);
create policy "Users can insert own wishes" on public.wishes
  for insert with check (auth.uid() = user_id);
create policy "Users can update own wishes" on public.wishes
  for update using (auth.uid() = user_id);
create policy "Users can delete own wishes" on public.wishes
  for delete using (auth.uid() = user_id);

-- Queen Bees: All authenticated can read, admins can manage
create policy "Queen bees viewable by all" on public.queen_bees
  for select using (auth.role() = 'authenticated');
create policy "Admins can insert queen bees" on public.queen_bees
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admins can update queen bees" on public.queen_bees
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admins can delete queen bees" on public.queen_bees
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Queen Bee Updates: All can read, authenticated can insert
create policy "QB updates viewable by all" on public.queen_bee_updates
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can add QB updates" on public.queen_bee_updates
  for insert with check (auth.role() = 'authenticated');

-- Meetings: All authenticated can read and manage
create policy "Meetings viewable by all" on public.meetings
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert meetings" on public.meetings
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update meetings" on public.meetings
  for update using (auth.role() = 'authenticated');

-- Action Items: All can read, assigned user or admin can update
create policy "Action items viewable by all" on public.action_items
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert action items" on public.action_items
  for insert with check (auth.role() = 'authenticated');
create policy "Assigned user can update action items" on public.action_items
  for update using (auth.uid() = assigned_to);

-- Honey Pot: All can read, treasurer can manage
create policy "Honey pot viewable by all" on public.honey_pot
  for select using (auth.role() = 'authenticated');
create policy "Treasurer can update honey pot" on public.honey_pot
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('treasurer', 'admin'))
  );

-- Honey Pot Transactions: All can read, treasurer can insert
create policy "Transactions viewable by all" on public.honey_pot_transactions
  for select using (auth.role() = 'authenticated');
create policy "Treasurer can add transactions" on public.honey_pot_transactions
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('treasurer', 'admin'))
  );

-- Events: All can read and manage
create policy "Events viewable by all" on public.events
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert events" on public.events
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update events" on public.events
  for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete events" on public.events
  for delete using (auth.role() = 'authenticated');

-- Notifications: Users can only see own
create policy "Users see own notifications" on public.notifications
  for select using (auth.uid() = user_id);
create policy "System can create notifications" on public.notifications
  for insert with check (true); -- Edge functions handle creation

-- Chat Messages: Users can only see own
create policy "Users see own chat history" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "Users can insert own messages" on public.chat_messages
  for insert with check (auth.uid() = user_id);

-- Initialize honey pot with single row
insert into public.honey_pot (balance) values (0);

-- Function to ensure only one active public wish per user
create or replace function check_active_wish()
returns trigger as $$
begin
  if NEW.status = 'public' and NEW.is_active = true then
    update public.wishes
    set is_active = false, status = 'replaced', replaced_at = now()
    where user_id = NEW.user_id
      and id != NEW.id
      and is_active = true;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger ensure_single_active_wish
  before insert or update on public.wishes
  for each row execute function check_active_wish();

-- Function to auto-create birthday events
create or replace function create_birthday_event()
returns trigger as $$
begin
  if NEW.birthday is not null and (OLD.birthday is null or OLD.birthday != NEW.birthday) then
    -- Delete existing birthday event for this user
    delete from public.events where related_user_id = NEW.id and event_type = 'birthday';
    -- Create new birthday event
    insert into public.events (title, event_date, event_type, related_user_id)
    values (
      NEW.name || '''s Birthday',
      NEW.birthday,
      'birthday',
      NEW.id
    );
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger auto_birthday_event
  after insert or update on public.profiles
  for each row execute function create_birthday_event();

-- Create storage bucket for meeting recordings
insert into storage.buckets (id, name, public) values ('meeting-recordings', 'meeting-recordings', false);

-- Storage policies for meeting recordings
create policy "Authenticated users can upload meeting recordings"
  on storage.objects for insert
  with check (bucket_id = 'meeting-recordings' and auth.role() = 'authenticated');

create policy "Authenticated users can read meeting recordings"
  on storage.objects for select
  using (bucket_id = 'meeting-recordings' and auth.role() = 'authenticated');

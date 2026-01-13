-- Migration: Add conversations table and conversation_id to chat_messages

-- Conversations table
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text, -- Auto-generated or user-provided
  mode text default 'default', -- 'default', 'onboarding'
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add conversation_id to chat_messages
alter table public.chat_messages
  add column conversation_id uuid references public.conversations(id) on delete cascade;

-- Index for fast lookups
create index idx_messages_conversation on public.chat_messages(conversation_id);
create index idx_conversations_user on public.conversations(user_id);
create index idx_conversations_updated on public.conversations(updated_at desc);

-- RLS policies for conversations
alter table public.conversations enable row level security;

create policy "Users see own conversations" on public.conversations
  for select using (auth.uid() = user_id);
create policy "Users can insert own conversations" on public.conversations
  for insert with check (auth.uid() = user_id);
create policy "Users can update own conversations" on public.conversations
  for update using (auth.uid() = user_id);
create policy "Users can delete own conversations" on public.conversations
  for delete using (auth.uid() = user_id);

-- Migrate existing messages to legacy conversations
DO $$
DECLARE
  user_record RECORD;
  new_conv_id uuid;
BEGIN
  FOR user_record IN
    SELECT DISTINCT user_id FROM public.chat_messages WHERE conversation_id IS NULL
  LOOP
    INSERT INTO public.conversations (user_id, title, mode)
    VALUES (user_record.user_id, 'Previous Chats', 'default')
    RETURNING id INTO new_conv_id;

    UPDATE public.chat_messages
    SET conversation_id = new_conv_id
    WHERE user_id = user_record.user_id AND conversation_id IS NULL;
  END LOOP;
END $$;

-- Function to auto-update conversation updated_at when messages are added
create or replace function update_conversation_timestamp()
returns trigger as $$
begin
  if NEW.conversation_id is not null then
    update public.conversations
    set updated_at = now()
    where id = NEW.conversation_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger update_conversation_on_message
  after insert on public.chat_messages
  for each row execute function update_conversation_timestamp();

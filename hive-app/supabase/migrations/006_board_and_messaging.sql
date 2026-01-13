-- Migration: 006_board_and_messaging.sql
-- Adds Message Board and Intergroup Chat features

-- ============================================
-- ENUM TYPES
-- ============================================

-- Board category types
create type board_category_type as enum (
  'announcements',
  'general',
  'queen_bee',
  'resources',
  'introductions',
  'custom'
);

-- Chat room types
create type chat_room_type as enum ('community', 'dm');

-- ============================================
-- MESSAGE BOARD TABLES
-- ============================================

-- Board categories (predefined + user-created)
create table public.board_categories (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  name text not null,
  description text,
  category_type board_category_type not null,
  icon text,
  display_order int default 0,
  is_system boolean default false,
  requires_admin boolean default false,
  requires_approval boolean default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique (community_id, name)
);

-- Board posts
create table public.board_posts (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  category_id uuid references public.board_categories(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  content text not null,
  is_pinned boolean default false,
  is_locked boolean default false,
  edited_at timestamptz,
  reply_count int default 0,
  last_reply_at timestamptz,
  last_reply_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Board replies (threaded)
create table public.board_replies (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  post_id uuid references public.board_posts(id) on delete cascade not null,
  parent_reply_id uuid references public.board_replies(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  edited_at timestamptz,
  created_at timestamptz default now()
);

-- Board reactions (for posts and replies)
create table public.board_reactions (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  post_id uuid references public.board_posts(id) on delete cascade,
  reply_id uuid references public.board_replies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default now(),
  constraint reaction_target_check check (
    (post_id is not null and reply_id is null) or
    (post_id is null and reply_id is not null)
  ),
  unique (post_id, user_id, emoji),
  unique (reply_id, user_id, emoji)
);

-- ============================================
-- CHAT TABLES
-- ============================================

-- Chat rooms (community-wide and DMs)
create table public.chat_rooms (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  room_type chat_room_type not null,
  name text,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Chat room members
create table public.chat_room_members (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  last_read_at timestamptz default now(),
  muted boolean default false,
  joined_at timestamptz default now(),
  unique (room_id, user_id)
);

-- Room messages (human-to-human chat)
create table public.room_messages (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  edited_at timestamptz,
  deleted_at timestamptz,
  reply_to_id uuid references public.room_messages(id),
  created_at timestamptz default now()
);

-- Message reactions
create table public.message_reactions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.room_messages(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);

-- Typing indicators
create table public.typing_indicators (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  updated_at timestamptz default now(),
  unique (room_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Board indexes
create index board_categories_community_idx on public.board_categories(community_id);
create index board_posts_category_idx on public.board_posts(category_id);
create index board_posts_community_created_idx on public.board_posts(community_id, created_at desc);
create index board_replies_post_idx on public.board_replies(post_id, created_at);
create index board_reactions_post_idx on public.board_reactions(post_id);
create index board_reactions_reply_idx on public.board_reactions(reply_id);

-- Chat indexes
create index chat_rooms_community_idx on public.chat_rooms(community_id);
create index room_messages_room_idx on public.room_messages(room_id, created_at desc);
create index chat_room_members_user_idx on public.chat_room_members(user_id);
create index typing_indicators_room_idx on public.typing_indicators(room_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.board_categories enable row level security;
alter table public.board_posts enable row level security;
alter table public.board_replies enable row level security;
alter table public.board_reactions enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.room_messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.typing_indicators enable row level security;

-- Board Categories policies
create policy "Categories viewable by community members" on public.board_categories
  for select using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_categories.community_id and user_id = auth.uid()
    )
  );

create policy "Admins can manage categories" on public.board_categories
  for all using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_categories.community_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Members can suggest categories" on public.board_categories
  for insert with check (
    exists (
      select 1 from public.community_memberships
      where community_id = board_categories.community_id and user_id = auth.uid()
    )
    and requires_approval = true
    and approved_at is null
  );

-- Board Posts policies
create policy "Posts viewable by community members" on public.board_posts
  for select using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_posts.community_id and user_id = auth.uid()
    )
  );

create policy "Members can create posts in non-admin categories" on public.board_posts
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.community_memberships
      where community_id = board_posts.community_id and user_id = auth.uid()
    )
    and not exists (
      select 1 from public.board_categories
      where id = category_id and requires_admin = true
    )
  );

create policy "Admins can post in any category" on public.board_posts
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.community_memberships
      where community_id = board_posts.community_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Authors can update own posts" on public.board_posts
  for update using (auth.uid() = author_id);

create policy "Admins can update any post" on public.board_posts
  for update using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_posts.community_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Authors can delete own posts" on public.board_posts
  for delete using (auth.uid() = author_id);

create policy "Admins can delete any post" on public.board_posts
  for delete using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_posts.community_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Board Replies policies
create policy "Replies viewable by community members" on public.board_replies
  for select using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_replies.community_id and user_id = auth.uid()
    )
  );

create policy "Members can reply to unlocked posts" on public.board_replies
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.community_memberships
      where community_id = board_replies.community_id and user_id = auth.uid()
    )
    and not exists (
      select 1 from public.board_posts
      where id = post_id and is_locked = true
    )
  );

create policy "Authors can update own replies" on public.board_replies
  for update using (auth.uid() = author_id);

create policy "Authors can delete own replies" on public.board_replies
  for delete using (auth.uid() = author_id);

-- Board Reactions policies
create policy "Reactions viewable by community members" on public.board_reactions
  for select using (
    exists (
      select 1 from public.community_memberships
      where community_id = board_reactions.community_id and user_id = auth.uid()
    )
  );

create policy "Members can add reactions" on public.board_reactions
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.community_memberships
      where community_id = board_reactions.community_id and user_id = auth.uid()
    )
  );

create policy "Users can remove own reactions" on public.board_reactions
  for delete using (auth.uid() = user_id);

-- Chat Rooms policies
create policy "Community rooms viewable by members" on public.chat_rooms
  for select using (
    exists (
      select 1 from public.community_memberships
      where community_id = chat_rooms.community_id and user_id = auth.uid()
    )
    and (
      room_type = 'community'
      or exists (
        select 1 from public.chat_room_members
        where room_id = chat_rooms.id and user_id = auth.uid()
      )
    )
  );

create policy "Members can create DM rooms" on public.chat_rooms
  for insert with check (
    room_type = 'dm'
    and exists (
      select 1 from public.community_memberships
      where community_id = chat_rooms.community_id and user_id = auth.uid()
    )
  );

create policy "Admins can create community rooms" on public.chat_rooms
  for insert with check (
    room_type = 'community'
    and exists (
      select 1 from public.community_memberships
      where community_id = chat_rooms.community_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Chat Room Members policies
create policy "Room members viewable by community members" on public.chat_room_members
  for select using (
    exists (
      select 1 from public.chat_rooms r
      join public.community_memberships cm on cm.community_id = r.community_id
      where r.id = chat_room_members.room_id and cm.user_id = auth.uid()
    )
  );

create policy "Users can manage own membership" on public.chat_room_members
  for all using (auth.uid() = user_id);

-- Room Messages policies
create policy "Messages viewable by room participants" on public.room_messages
  for select using (
    exists (
      select 1 from public.chat_room_members
      where room_id = room_messages.room_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.chat_rooms r
      join public.community_memberships cm on cm.community_id = r.community_id
      where r.id = room_messages.room_id
        and r.room_type = 'community'
        and cm.user_id = auth.uid()
    )
  );

create policy "Members can send messages" on public.room_messages
  for insert with check (
    auth.uid() = sender_id
    and (
      exists (
        select 1 from public.chat_room_members
        where room_id = room_messages.room_id and user_id = auth.uid()
      )
      or exists (
        select 1 from public.chat_rooms r
        join public.community_memberships cm on cm.community_id = r.community_id
        where r.id = room_messages.room_id
          and r.room_type = 'community'
          and cm.user_id = auth.uid()
      )
    )
  );

create policy "Senders can edit own messages" on public.room_messages
  for update using (auth.uid() = sender_id);

create policy "Senders can delete own messages" on public.room_messages
  for delete using (auth.uid() = sender_id);

-- Message Reactions policies
create policy "Message reactions viewable" on public.message_reactions
  for select using (
    exists (
      select 1 from public.room_messages m
      join public.chat_rooms r on r.id = m.room_id
      join public.community_memberships cm on cm.community_id = r.community_id
      where m.id = message_reactions.message_id and cm.user_id = auth.uid()
    )
  );

create policy "Users can add message reactions" on public.message_reactions
  for insert with check (auth.uid() = user_id);

create policy "Users can remove own message reactions" on public.message_reactions
  for delete using (auth.uid() = user_id);

-- Typing Indicators policies
create policy "Typing indicators viewable by room members" on public.typing_indicators
  for select using (
    exists (
      select 1 from public.chat_room_members
      where room_id = typing_indicators.room_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.chat_rooms r
      join public.community_memberships cm on cm.community_id = r.community_id
      where r.id = typing_indicators.room_id
        and r.room_type = 'community'
        and cm.user_id = auth.uid()
    )
  );

create policy "Users can manage own typing indicator" on public.typing_indicators
  for all using (auth.uid() = user_id);

-- ============================================
-- TRIGGERS AND FUNCTIONS
-- ============================================

-- Create default board categories for new communities
create or replace function create_default_board_categories()
returns trigger as $$
begin
  insert into public.board_categories (community_id, name, description, category_type, icon, display_order, is_system, requires_admin)
  values
    (NEW.id, 'Announcements', 'Important updates from admins', 'announcements', '1F4E2', 1, true, true),
    (NEW.id, 'General Discussion', 'Open conversations about anything', 'general', '1F4AC', 2, true, false),
    (NEW.id, 'Queen Bee Updates', 'Updates and discussion about the current Queen Bee project', 'queen_bee', '1F451', 3, true, false),
    (NEW.id, 'Resources', 'Shared links, documents, and helpful materials', 'resources', '1F4DA', 4, true, false),
    (NEW.id, 'Introductions', 'Welcome new members and share about yourself', 'introductions', '1F44B', 5, true, false);
  return NEW;
end;
$$ language plpgsql;

create trigger auto_create_board_categories
  after insert on public.communities
  for each row execute function create_default_board_categories();

-- Create default community chat room
create or replace function create_default_chat_room()
returns trigger as $$
begin
  insert into public.chat_rooms (community_id, room_type, name, description, created_by)
  values (NEW.id, 'community', 'General', 'Community-wide chat', NEW.created_by);
  return NEW;
end;
$$ language plpgsql;

create trigger auto_create_chat_room
  after insert on public.communities
  for each row execute function create_default_chat_room();

-- Auto-join members to community chat rooms
create or replace function auto_join_community_chat()
returns trigger as $$
begin
  insert into public.chat_room_members (room_id, user_id)
  select r.id, NEW.user_id
  from public.chat_rooms r
  where r.community_id = NEW.community_id and r.room_type = 'community'
  on conflict (room_id, user_id) do nothing;
  return NEW;
end;
$$ language plpgsql;

create trigger auto_join_chat_on_membership
  after insert on public.community_memberships
  for each row execute function auto_join_community_chat();

-- Update reply count on board posts
create or replace function update_post_reply_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.board_posts
    set reply_count = reply_count + 1,
        last_reply_at = NEW.created_at,
        last_reply_by = NEW.author_id
    where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.board_posts
    set reply_count = greatest(reply_count - 1, 0)
    where id = OLD.post_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$ language plpgsql;

create trigger update_reply_count
  after insert or delete on public.board_replies
  for each row execute function update_post_reply_count();

-- Find or create DM room between two users
create or replace function get_or_create_dm_room(
  p_community_id uuid,
  p_user1_id uuid,
  p_user2_id uuid
) returns uuid as $$
declare
  v_room_id uuid;
begin
  -- Find existing DM room between these two users
  select r.id into v_room_id
  from public.chat_rooms r
  where r.community_id = p_community_id
    and r.room_type = 'dm'
    and exists (
      select 1 from public.chat_room_members m1
      where m1.room_id = r.id and m1.user_id = p_user1_id
    )
    and exists (
      select 1 from public.chat_room_members m2
      where m2.room_id = r.id and m2.user_id = p_user2_id
    )
    and (
      select count(*) from public.chat_room_members m
      where m.room_id = r.id
    ) = 2
  limit 1;

  -- If not found, create new room
  if v_room_id is null then
    insert into public.chat_rooms (community_id, room_type, created_by)
    values (p_community_id, 'dm', p_user1_id)
    returning id into v_room_id;

    -- Add both users as members
    insert into public.chat_room_members (room_id, user_id)
    values (v_room_id, p_user1_id), (v_room_id, p_user2_id);
  end if;

  return v_room_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- ENABLE REALTIME
-- ============================================

alter publication supabase_realtime add table public.room_messages;
alter publication supabase_realtime add table public.typing_indicators;
alter publication supabase_realtime add table public.board_posts;
alter publication supabase_realtime add table public.board_replies;

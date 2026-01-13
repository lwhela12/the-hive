-- Multi-community support

create extension if not exists "uuid-ossp";

-- Communities
create table if not exists public.communities (
  id uuid default extensions.uuid_generate_v4() primary key,
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.community_memberships (
  id uuid default extensions.uuid_generate_v4() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role user_role default 'member',
  created_at timestamptz default now(),
  unique (community_id, user_id)
);

create table if not exists public.community_invites (
  id uuid default extensions.uuid_generate_v4() primary key,
  community_id uuid references public.communities(id) on delete cascade not null,
  email text not null,
  role user_role default 'member',
  invited_by uuid references public.profiles(id) on delete set null,
  token text not null unique,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- Add current community to profile
alter table public.profiles add column if not exists current_community_id uuid references public.communities(id);

-- Add community_id to shared tables
alter table public.skills add column if not exists community_id uuid references public.communities(id);
alter table public.wishes add column if not exists community_id uuid references public.communities(id);
alter table public.queen_bees add column if not exists community_id uuid references public.communities(id);
alter table public.queen_bee_updates add column if not exists community_id uuid references public.communities(id);
alter table public.meetings add column if not exists community_id uuid references public.communities(id);
alter table public.action_items add column if not exists community_id uuid references public.communities(id);
alter table public.honey_pot add column if not exists community_id uuid references public.communities(id);
alter table public.honey_pot_transactions add column if not exists community_id uuid references public.communities(id);
alter table public.events add column if not exists community_id uuid references public.communities(id);
alter table public.notifications add column if not exists community_id uuid references public.communities(id);
alter table public.chat_messages add column if not exists community_id uuid references public.communities(id);

-- Default community for existing data
insert into public.communities (name, slug)
select 'The Hive', 'default'
where not exists (select 1 from public.communities where slug = 'default');

update public.profiles
set current_community_id = (select id from public.communities where slug = 'default')
where current_community_id is null;

insert into public.community_memberships (community_id, user_id, role)
select (select id from public.communities where slug = 'default'), id, role
from public.profiles
on conflict (community_id, user_id) do nothing;

update public.skills
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.wishes
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.queen_bees
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.queen_bee_updates
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.meetings
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.action_items
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.honey_pot
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.honey_pot_transactions
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.events
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.notifications
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

update public.chat_messages
set community_id = (select id from public.communities where slug = 'default')
where community_id is null;

alter table public.skills alter column community_id set not null;
alter table public.wishes alter column community_id set not null;
alter table public.queen_bees alter column community_id set not null;
alter table public.queen_bee_updates alter column community_id set not null;
alter table public.meetings alter column community_id set not null;
alter table public.action_items alter column community_id set not null;
alter table public.honey_pot alter column community_id set not null;
alter table public.honey_pot_transactions alter column community_id set not null;
alter table public.events alter column community_id set not null;
alter table public.notifications alter column community_id set not null;
alter table public.chat_messages alter column community_id set not null;

create unique index if not exists queen_bees_community_month_idx on public.queen_bees (community_id, month);
create unique index if not exists honey_pot_community_idx on public.honey_pot (community_id);

-- Update wish constraint trigger to be community scoped
create or replace function check_active_wish()
returns trigger as $$
begin
  if NEW.status = 'public' and NEW.is_active = true then
    update public.wishes
    set is_active = false, status = 'replaced', replaced_at = now()
    where user_id = NEW.user_id
      and community_id = NEW.community_id
      and id != NEW.id
      and is_active = true;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Update birthday event trigger to include community
create or replace function create_birthday_event()
returns trigger as $$
begin
  if NEW.birthday is not null and (OLD.birthday is null or OLD.birthday != NEW.birthday) then
    delete from public.events
    where related_user_id = NEW.id and event_type = 'birthday' and community_id = NEW.current_community_id;
    insert into public.events (title, event_date, event_type, related_user_id, community_id)
    values (
      NEW.name || '''s Birthday',
      NEW.birthday,
      'birthday',
      NEW.id,
      NEW.current_community_id
    );
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Community role helpers
create or replace function public.is_community_member(c_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.community_memberships
    where community_id = c_id and user_id = auth.uid()
  );
$$ language sql stable;

create or replace function public.is_community_admin(c_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.community_memberships
    where community_id = c_id and user_id = auth.uid() and role = 'admin'
  );
$$ language sql stable;

create or replace function public.is_community_treasurer(c_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.community_memberships
    where community_id = c_id and user_id = auth.uid() and role in ('treasurer', 'admin')
  );
$$ language sql stable;

-- Enable RLS on new tables
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_invites enable row level security;

-- Drop old policies before redefining
DO $$
begin
  execute 'drop policy if exists "Profiles are viewable by authenticated users" on public.profiles';
  execute 'drop policy if exists "Users can update own profile" on public.profiles';
  execute 'drop policy if exists "Users can insert own profile" on public.profiles';

  execute 'drop policy if exists "Skills are viewable by authenticated users" on public.skills';
  execute 'drop policy if exists "Users can insert own skills" on public.skills';
  execute 'drop policy if exists "Users can update own skills" on public.skills';
  execute 'drop policy if exists "Users can delete own skills" on public.skills';

  execute 'drop policy if exists "Users can read public wishes" on public.wishes';
  execute 'drop policy if exists "Users can insert own wishes" on public.wishes';
  execute 'drop policy if exists "Users can update own wishes" on public.wishes';
  execute 'drop policy if exists "Users can delete own wishes" on public.wishes';

  execute 'drop policy if exists "Queen bees viewable by all" on public.queen_bees';
  execute 'drop policy if exists "Admins can insert queen bees" on public.queen_bees';
  execute 'drop policy if exists "Admins can update queen bees" on public.queen_bees';
  execute 'drop policy if exists "Admins can delete queen bees" on public.queen_bees';

  execute 'drop policy if exists "QB updates viewable by all" on public.queen_bee_updates';
  execute 'drop policy if exists "Authenticated can add QB updates" on public.queen_bee_updates';

  execute 'drop policy if exists "Meetings viewable by all" on public.meetings';
  execute 'drop policy if exists "Authenticated can insert meetings" on public.meetings';
  execute 'drop policy if exists "Authenticated can update meetings" on public.meetings';

  execute 'drop policy if exists "Action items viewable by all" on public.action_items';
  execute 'drop policy if exists "Authenticated can insert action items" on public.action_items';
  execute 'drop policy if exists "Assigned user can update action items" on public.action_items';

  execute 'drop policy if exists "Honey pot viewable by all" on public.honey_pot';
  execute 'drop policy if exists "Treasurer can update honey pot" on public.honey_pot';

  execute 'drop policy if exists "Transactions viewable by all" on public.honey_pot_transactions';
  execute 'drop policy if exists "Treasurer can add transactions" on public.honey_pot_transactions';

  execute 'drop policy if exists "Events viewable by all" on public.events';
  execute 'drop policy if exists "Authenticated can insert events" on public.events';
  execute 'drop policy if exists "Authenticated can update events" on public.events';
  execute 'drop policy if exists "Authenticated can delete events" on public.events';

  execute 'drop policy if exists "Users see own notifications" on public.notifications';
  execute 'drop policy if exists "System can create notifications" on public.notifications';

  execute 'drop policy if exists "Users see own chat history" on public.chat_messages';
  execute 'drop policy if exists "Users can insert own messages" on public.chat_messages';
  execute 'drop policy if exists "Users can delete own chat messages" on public.chat_messages';
end $$;

-- Communities policies
create policy "Communities viewable by members" on public.communities
  for select using (public.is_community_member(id));
create policy "Authenticated can create communities" on public.communities
  for insert with check (auth.role() = 'authenticated');
create policy "Community admins can update" on public.communities
  for update using (public.is_community_admin(id));
create policy "Community admins can delete" on public.communities
  for delete using (public.is_community_admin(id));

-- Membership policies
create policy "Members can view memberships" on public.community_memberships
  for select using (public.is_community_member(community_id));
create policy "Admins can add members" on public.community_memberships
  for insert with check (public.is_community_admin(community_id));
create policy "Admins can update members" on public.community_memberships
  for update using (public.is_community_admin(community_id));
create policy "Admins can remove members" on public.community_memberships
  for delete using (public.is_community_admin(community_id));

-- Invite policies
create policy "Admins can view invites" on public.community_invites
  for select using (public.is_community_admin(community_id));
create policy "Admins can create invites" on public.community_invites
  for insert with check (public.is_community_admin(community_id));
create policy "Admins can update invites" on public.community_invites
  for update using (public.is_community_admin(community_id));

-- Profiles: view members of same community, update own
create policy "Profiles viewable by community members" on public.profiles
  for select using (
    exists (
      select 1 from public.community_memberships cm
      where cm.user_id = profiles.id
        and cm.community_id in (
          select community_id from public.community_memberships
          where user_id = auth.uid()
        )
    )
  );
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Skills
create policy "Skills viewable by community members" on public.skills
  for select using (public.is_community_member(community_id));
create policy "Users can insert own skills" on public.skills
  for insert with check (auth.uid() = user_id and public.is_community_member(community_id));
create policy "Users can update own skills" on public.skills
  for update using (auth.uid() = user_id and public.is_community_member(community_id));
create policy "Users can delete own skills" on public.skills
  for delete using (auth.uid() = user_id and public.is_community_member(community_id));

-- Wishes
create policy "Wishes viewable by community members" on public.wishes
  for select using (
    public.is_community_member(community_id)
    and (status = 'public' or auth.uid() = user_id)
  );
create policy "Users can insert own wishes" on public.wishes
  for insert with check (auth.uid() = user_id and public.is_community_member(community_id));
create policy "Users can update own wishes" on public.wishes
  for update using (auth.uid() = user_id and public.is_community_member(community_id));
create policy "Users can delete own wishes" on public.wishes
  for delete using (auth.uid() = user_id and public.is_community_member(community_id));

-- Queen Bees
create policy "Queen bees viewable by members" on public.queen_bees
  for select using (public.is_community_member(community_id));
create policy "Admins can insert queen bees" on public.queen_bees
  for insert with check (public.is_community_admin(community_id));
create policy "Admins can update queen bees" on public.queen_bees
  for update using (public.is_community_admin(community_id));
create policy "Admins can delete queen bees" on public.queen_bees
  for delete using (public.is_community_admin(community_id));

-- Queen Bee Updates
create policy "QB updates viewable by members" on public.queen_bee_updates
  for select using (public.is_community_member(community_id));
create policy "Members can add QB updates" on public.queen_bee_updates
  for insert with check (public.is_community_member(community_id));

-- Meetings
create policy "Meetings viewable by members" on public.meetings
  for select using (public.is_community_member(community_id));
create policy "Members can insert meetings" on public.meetings
  for insert with check (public.is_community_member(community_id));
create policy "Members can update meetings" on public.meetings
  for update using (public.is_community_member(community_id));

-- Action Items
create policy "Action items viewable by members" on public.action_items
  for select using (public.is_community_member(community_id));
create policy "Members can insert action items" on public.action_items
  for insert with check (public.is_community_member(community_id));
create policy "Assigned user can update action items" on public.action_items
  for update using (
    public.is_community_member(community_id)
    and (auth.uid() = assigned_to or public.is_community_admin(community_id))
  );

-- Honey Pot
create policy "Honey pot viewable by members" on public.honey_pot
  for select using (public.is_community_member(community_id));
create policy "Treasurer can update honey pot" on public.honey_pot
  for update using (public.is_community_treasurer(community_id));

-- Honey Pot Transactions
create policy "Transactions viewable by members" on public.honey_pot_transactions
  for select using (public.is_community_member(community_id));
create policy "Treasurer can add transactions" on public.honey_pot_transactions
  for insert with check (public.is_community_treasurer(community_id));

-- Events
create policy "Events viewable by members" on public.events
  for select using (public.is_community_member(community_id));
create policy "Admins can insert events" on public.events
  for insert with check (public.is_community_admin(community_id));
create policy "Admins can update events" on public.events
  for update using (public.is_community_admin(community_id));
create policy "Admins can delete events" on public.events
  for delete using (public.is_community_admin(community_id));

-- Notifications
create policy "Users see own notifications" on public.notifications
  for select using (auth.uid() = user_id and public.is_community_member(community_id));
create policy "System can create notifications" on public.notifications
  for insert with check (true);

-- Chat Messages
create policy "Users see own chat history" on public.chat_messages
  for select using (auth.uid() = user_id and public.is_community_member(community_id));
create policy "Users can insert own messages" on public.chat_messages
  for insert with check (auth.uid() = user_id and public.is_community_member(community_id));
create policy "Users can delete own chat messages" on public.chat_messages
  for delete using (auth.uid() = user_id and public.is_community_member(community_id));

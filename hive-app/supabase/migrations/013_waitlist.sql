-- Migration: 013_waitlist.sql
-- Adds waitlist table for users who sign up without an invite
-- Also fixes invite RLS so users can see invites for their email

create table if not exists public.waitlist (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  name text,
  message text, -- optional message from the user
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.waitlist enable row level security;

-- Admins of any community can view waitlist (for potential invites)
create policy "Community admins can view waitlist" on public.waitlist
  for select using (
    exists (
      select 1 from public.community_memberships
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Anyone authenticated can add themselves to waitlist
create policy "Users can add self to waitlist" on public.waitlist
  for insert with check (true);

-- Users can remove themselves from waitlist
create policy "Users can remove self from waitlist" on public.waitlist
  for delete using (
    email = (select email from auth.users where id = auth.uid())
  );

-- Fix community_invites RLS: allow users to see invites for their own email
create policy "Users can view invites for their email" on public.community_invites
  for select using (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
  );

-- Allow users to update invites for their email (to mark as accepted)
create policy "Users can accept their own invites" on public.community_invites
  for update using (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
  );

-- Also need to allow users to insert their own membership when accepting invite
create policy "Users can add self to community via invite" on public.community_memberships
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.community_invites
      where community_id = community_memberships.community_id
        and lower(email) = lower((select email from auth.users where id = auth.uid()))
        and accepted_at is null
        and (expires_at is null or expires_at > now())
    )
  );

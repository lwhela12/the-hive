-- Fix RLS helper functions to avoid recursive policy evaluation

create or replace function public.is_community_member(c_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_memberships
    where community_id = c_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_community_admin(c_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_memberships
    where community_id = c_id and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_community_treasurer(c_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_memberships
    where community_id = c_id and user_id = auth.uid() and role in ('treasurer', 'admin')
  );
$$;

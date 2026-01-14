-- Fix is_community_admin to also check profiles.role
-- This allows users with admin role in profiles table to have admin privileges
-- even if their community_memberships.role isn't set

create or replace function public.is_community_admin(c_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.community_memberships cm
    join public.profiles p on p.id = cm.user_id
    where cm.community_id = c_id
      and cm.user_id = auth.uid()
      and (cm.role = 'admin' or p.role = 'admin')
  );
$$ language sql stable;

-- Historian is no longer a live app role. Keep the old enum value for database
-- compatibility, but normalize any existing assignments back to member.

update public.community_memberships
set role = 'member'
where role::text = 'historian';

update public.community_invites
set role = 'member'
where role::text = 'historian'
  and accepted_at is null;

update public.profiles
set role = 'member'
where role::text = 'historian';

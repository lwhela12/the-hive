-- An invitee can accept the seat they were offered. They cannot rewrite it.
--
-- Migration 151 made membership roles come from `community_invites.role`, which
-- closed the direct "send role: admin from the browser" path. The older
-- "Users can accept own invites" UPDATE policy still allowed that same invitee
-- to change every column on their invite before joining, though. That made the
-- invite row itself a role-escalation path.
--
-- RLS cannot compare OLD and NEW values. This BEFORE UPDATE trigger can. Owners,
-- HIVE admins, and service-role repair paths keep their existing abilities;
-- everyone else may only consume their own unaccepted invite by setting
-- `accepted_at` once.

create or replace function public.an_invitee_can_only_accept_the_invite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Service-role/backend repairs bypass RLS already and do not carry a user id.
  if auth.uid() is null then
    return new;
  end if;

  -- HIVE owners/admins are allowed to maintain invites. The existing RLS policy
  -- independently requires this same authority.
  if public.is_community_admin(old.community_id) then
    return new;
  end if;

  -- A member can only operate on the invite addressed to their signed-in email.
  -- Keep this check here as defense in depth beside the RLS USING/WITH CHECK.
  if auth.email() is null
     or lower(old.email) <> lower(auth.email())
     or lower(new.email) <> lower(auth.email()) then
    raise exception 'This invite belongs to a different account.'
      using errcode = '42501';
  end if;

  -- `accepted_at` is the only field an invitee may ever change. Explicitly name
  -- every other column so a future schema change fails closed until reviewed.
  if new.id is distinct from old.id
     or new.community_id is distinct from old.community_id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.invited_by is distinct from old.invited_by
     or new.token is distinct from old.token
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'An invitee cannot change the seat an invite offers.'
      using errcode = '42501';
  end if;

  -- Acceptance is one-way and only valid while the invite is still live.
  if old.accepted_at is not null
     or new.accepted_at is null
     or (old.expires_at is not null and old.expires_at <= now()) then
    raise exception 'This invite can no longer be accepted.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists an_invitee_can_only_accept_the_invite
  on public.community_invites;

create trigger an_invitee_can_only_accept_the_invite
  before update on public.community_invites
  for each row execute function public.an_invitee_can_only_accept_the_invite();

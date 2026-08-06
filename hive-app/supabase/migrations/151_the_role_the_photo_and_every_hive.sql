-- Four things that were each true of one HIVE and wrong for the rest.
--
--   1. Member photos were a public roster anybody could walk.
--   2. An invitee could hand themselves any role they liked on the way in.
--   3. Tech HIVE still said it met weekly.
--   4. The nightly meeting seal only ever ran for OG HIVE.
--
-- Written 2026-08-06.


-- ---------------------------------------------------------------------------
-- 1. Member photos stop being a public roster
-- ---------------------------------------------------------------------------
--
-- Migration 009 created the `avatars` bucket with `public = true` and a SELECT
-- policy granting the `public` role, and nobody has looked at it since. That is
-- the same shape migration 146 found on `attachments` one bucket over, and the
-- damage is the same: a bucket that is readable by the `public` role is a
-- bucket a stranger can LIST. The folder names are member ids, so listing it
-- hands over a roster of everybody in HIVE along with their photographs, to
-- somebody who never signed in.
--
-- Reading now takes being signed in AND being in a HIVE — `is_any_community_member()`,
-- the same helper the attachments lock and the cross-HIVE board policies use.
-- Anonymous listing returns nothing.
--
-- Photos themselves are fetched with short-lived signed links from now on:
-- `components/ui/Avatar.tsx` signs them, and all 33 places that draw a member's
-- face go through it.

drop policy if exists "Avatars are publicly accessible" on storage.objects;

create policy "Avatars are for members"
  on storage.objects for select
  using (bucket_id = 'avatars' and public.is_any_community_member());

-- WHAT IS STILL OPEN, said plainly rather than left as a surprise.
--
-- `storage.buckets.public` is deliberately still `true` for `avatars`. The flag
-- does one remaining thing: it keeps the old `/object/public/avatars/<key>`
-- addresses resolving. Six member photos are stored in the database as exactly
-- those addresses, and TWO screens still draw them with a raw image tag instead
-- of going through `Avatar.tsx`:
--
--   app/(app)/_layout.tsx:375   the profile tab icon
--   app/(app)/hive.tsx:2986     the daily-question member strip on Home
--
-- Flipping the flag today would empty both of those with no warning. Once those
-- two render through `Avatar.tsx` like everything else, this is the whole
-- follow-up, one line:
--
--   update storage.buckets set public = false where id = 'avatars';
--
-- The listing hole — the one that leaked a roster to strangers — is closed
-- above, and closed now. What remains is that a person already holding the
-- exact address of a photo (two random uuids) can still fetch it unsigned.


-- ---------------------------------------------------------------------------
-- 2. Your role is the one on your invite
-- ---------------------------------------------------------------------------
--
-- The INSERT policy "Users can join via invite" proves THAT you hold a live
-- invite to this HIVE and never asks WHAT that invite offered you. The join
-- screen sends `role: invite.role` from the browser, so the role arriving in
-- the row was whatever the client chose to type — and an invitee who edited it
-- to 'admin' became an admin of a HIVE they had not yet entered.
--
-- A WITH CHECK clause cannot say this cleanly: it would have to reach into the
-- invite row and compare, for every insert, including the ones that have no
-- invite at all. A BEFORE INSERT trigger can look at who is asking first, and
-- only then decide.
--
-- The rule: when somebody adds THEMSELVES on an invite, the role is copied off
-- the invite. Not rejected — copied. A member with a stale page in a tab should
-- land in the right seat, not get an error they cannot act on.

create or replace function public.role_comes_from_the_invite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  invite_found boolean;
  invited_role user_role;
begin
  -- The backend, running as the service role, has no auth.uid() and already
  -- bypasses every policy on this table. Refusing it here would buy nothing and
  -- break the repair tools — the same reasoning `pin_the_hive_a_row_belongs_to`
  -- records one trigger over.
  if auth.uid() is null then
    return new;
  end if;

  -- Somebody adding somebody else. Only "Admins can add members" lets that
  -- through the policy, and an admin choosing a role is the point of it.
  if new.user_id <> auth.uid() then
    return new;
  end if;

  -- The first membership in an empty database: the founder makes themselves an
  -- admin, which is what "Genesis user can bootstrap community" is for.
  if public.is_genesis_state() then
    return new;
  end if;

  -- Already runs this HIVE, or owns all of them.
  if public.is_community_admin(new.community_id) then
    return new;
  end if;

  -- Everything left is a person joining on an invite. Find it the same way the
  -- policy does, so the two can never disagree about which invite is live.
  select true, ci.role
    into invite_found, invited_role
  from public.community_invites ci
  where ci.community_id = new.community_id
    and lower(ci.email) = lower(auth.email())
    and ci.accepted_at is null
    and (ci.expires_at is null or ci.expires_at > now())
  order by ci.created_at desc
  limit 1;

  if not coalesce(invite_found, false) then
    raise exception 'Joining a HIVE takes an invite.' using errcode = '42501';
  end if;

  -- `community_invites.role` may be null; the column's own default is 'member'
  -- and so is ours.
  new.role := coalesce(invited_role, 'member'::user_role);
  return new;
end;
$$;

drop trigger if exists role_comes_from_the_invite on public.community_memberships;

create trigger role_comes_from_the_invite
  before insert on public.community_memberships
  for each row execute function public.role_comes_from_the_invite();


-- ---------------------------------------------------------------------------
-- 3. Tech HIVE meets monthly
-- ---------------------------------------------------------------------------
--
-- Nat's call over dinner on 2026-08-05: first Thursday of the month, 5pm. Tech
-- HIVE's row still said `weekly`, which is now the only 'weekly' left anywhere.
--
-- Nothing else changes. That decision is what removed the need for weekly
-- machinery, and the check-in and meeting engine stays month-keyed. The single
-- place `meeting_cadence` is read is the default title in
-- `components/meetings/ScheduleMeetingModal.tsx`, which already treats monthly
-- as the ordinary case.

update public.communities set meeting_cadence = 'monthly' where slug = 'tech';


-- ---------------------------------------------------------------------------
-- 4. The nightly seal runs for every HIVE that met
-- ---------------------------------------------------------------------------
--
-- Migration 132 wrote OG HIVE's id into this job's request body and said so out
-- loud: "With three it means Tech HIVE and Production HIVE never seal a meeting
-- at all, so their summaries stay blank however many meetings they hold." This
-- is that fix.
--
-- The job now asks the `events` table which HIVEs actually met, and posts once
-- per answer. A HIVE with no meeting yesterday is never called at all, so no
-- HIVE mints a meeting record for a meeting that did not happen — and
-- seal-meeting keeps its own identical guard, so the two would have to be wrong
-- together for that to change.
--
-- The date arithmetic mirrors `pacificToday()` inside the function exactly —
-- now minus seven hours, then take the date. At 04:00 UTC that is yesterday
-- evening in Pacific time, which is the day whose meeting we are sealing. If
-- the two ever drifted apart the function's own guard would simply answer
-- "no meeting on that date" and nothing would be written.
--
-- Everything else is unchanged from 132: the key is still read from Vault at
-- call time and never written down, and the schedule is still 9pm Pacific.
--
-- OG HIVE's slug is the literal string 'default' and migration 118's
-- `public_events` view depends on that. Nothing here touches either.

select cron.unschedule('seal-meeting-nightly');

select cron.schedule(
  'seal-meeting-nightly',
  '0 4 * * *',
  $job$
  select net.http_post(
    url := 'https://cpfvnfcjhoeowdcexppi.supabase.co/functions/v1/seal-meeting',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('communityId', met.community_id)
  )
  from (
    select distinct e.community_id
    from public.events e
    where e.event_type = 'meeting'
      and e.event_date = ((now() at time zone 'utc') - interval '7 hours')::date
  ) met;
  $job$
);

-- The waitlist grows up, so "I'm interested" has somewhere to land
--
-- The table has existed since migration 013 and `/join` has been writing to
-- it the whole time — but nothing in Admin ever read it, so anybody who put
-- themselves on it was filed into a drawer nobody opens. Nat, 2026-08-12,
-- on opening Tech HIVE for membership in The Buzz: *"how do they tell me
-- they are interested? ... do they populate on a waiting list? a waiting
-- list inside admin?"*
--
-- Three things it was missing:
--
--   1. WHICH HIVE. OG is closed to new members right now and Tech is open,
--      but Nat still wants OG's interest recorded — *"they could still join
--      the waitlist? then we could see who's interested & decide when we're
--      ready."* So this is an interest register, not a queue: being on it
--      promises nobody anything, and a closed HIVE can still collect names.
--   2. A STATUS, so working the list leaves a mark. Otherwise the only way
--      to know you already invited someone is to remember.
--   3. A WAY IN FOR STRANGERS. The one existing writer is `/join`, which
--      runs signed in. The Buzz goes to people with no account at all, so
--      the button in it has to work for somebody the app has never met.
--
-- `interested_in` holds a HIVE slug rather than a foreign key on purpose:
-- the public site writes here with the anon key and has no business reading
-- the communities table to translate a name into an id, and a slug that no
-- longer matches any HIVE should not be able to block a signup.

alter table public.waitlist
  add column if not exists interested_in text,
  add column if not exists status text not null default 'new',
  add column if not exists source text;

alter table public.waitlist
  drop constraint if exists waitlist_status_check;
alter table public.waitlist
  add constraint waitlist_status_check
  check (status in ('new', 'invited', 'joined', 'passed'));

comment on column public.waitlist.interested_in is
  'HIVE slug they asked about, or null for "any / not sure". A slug, not a foreign key: the public site writes here anonymously and must not need to read communities to do it.';
comment on column public.waitlist.status is
  'new -> invited -> joined | passed. Set by an owner in Admin so working the list leaves a mark.';
comment on column public.waitlist.source is
  'Where the interest came from: join-page, public-site, newsletter.';

-- The door for people with no account.
--
-- Same shape as `subscribe_to_newsletter` (migration 123) and for the same
-- reason: a security-definer function is the ONLY thing anon may call, so
-- the table itself never has to be opened to strangers, and nothing a caller
-- sends can be used to read back who else is on the list. It returns void —
-- a waitlist that answers "you are already on it" is a waitlist that tells
-- strangers who signed up.
create or replace function public.join_waitlist(
  p_email text,
  p_name text default null,
  p_message text default null,
  p_interested_in text default null,
  p_source text default 'public-site'
)
returns void as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
  clean_message text := nullif(trim(coalesce(p_message, '')), '');
  clean_interest text := nullif(trim(coalesce(p_interested_in, '')), '');
  clean_source text := nullif(trim(coalesce(p_source, '')), '');
begin
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(clean_email) > 254 then
    raise exception 'invalid email';
  end if;

  insert into public.waitlist (email, name, message, interested_in, source)
  values (clean_email, clean_name, clean_message, clean_interest, coalesce(clean_source, 'public-site'))
  on conflict (email) do update
    -- Asking again is a fresh ask: it should not wipe what they said the
    -- first time, but a newer note or a different HIVE is the current truth.
    set name = coalesce(excluded.name, public.waitlist.name),
        message = coalesce(excluded.message, public.waitlist.message),
        interested_in = coalesce(excluded.interested_in, public.waitlist.interested_in),
        -- Someone already invited who asks again is asking again; put them
        -- back in front of Nat rather than leaving them marked as handled.
        status = case when public.waitlist.status = 'passed' then 'passed' else 'new' end;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.join_waitlist(text, text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, text) to anon, authenticated;

-- Reading and working the list.
--
-- Migration 013 gave this table policies and never gave `authenticated` a
-- table grant, which is the exact shape of the bug that hid every newsletter
-- subscriber until migration 156: RLS policies sitting on top of no
-- permission at all, so every read failed silently and the screen just
-- looked empty. Granting explicitly here rather than assuming.
grant select, update on public.waitlist to authenticated;

-- Reading is already owners-only — a later migration than 013 replaced that
-- table's "any HIVE's admin" rule with `is_hive_owner()`, which is the line
-- migration 128 drew for anything that reads across communities. Left exactly
-- as found; this migration only adds the missing half.
--
-- Working the list is new: without an update policy, an owner could read the
-- waitlist in Admin and then not be able to mark anybody invited.
drop policy if exists "Owners can work the waitlist" on public.waitlist;
create policy "Owners can work the waitlist" on public.waitlist
  for update using (public.is_hive_owner());

comment on table public.waitlist is
  'People who asked to be told when a HIVE opens. An interest register, not a queue — being on it promises nothing, and a closed HIVE (OG, right now) can still collect names. Strangers reach it only through join_waitlist(); owners read and work it in Admin.';

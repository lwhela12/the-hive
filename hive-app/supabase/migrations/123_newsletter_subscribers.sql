-- The newsletter list finally lives somewhere
--
-- Wix held the list; nothing replaced it when the site moved (2026-08-01). The
-- public site's sign-up form has been opening Nat's mail app and composing a
-- message to herself, which is a to-do item wearing a form's clothes.
--
-- Members are NOT in here. They get the newsletter because they're members, and
-- they turn it off with profiles.email_newsletter_enabled (migration 117). This
-- table is only for people outside the HIVEs — family, friends, the curious —
-- and the two lists get merged, de-duplicated by email, at send time.
--
-- Security follows the same shape as public_events (migration 118): anonymous
-- visitors never touch the table. They can only call two functions, one that
-- adds an address and one that removes it, and neither ever hands back a list.
-- There is no query a stranger can write that enumerates who is subscribed.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default extensions.uuid_generate_v4(),
  email text not null,
  name text,
  -- Where they came from, so a bad batch could be traced later.
  source text not null default 'public_site',
  -- Their private unsubscribe key. Every newsletter carries a link built from
  -- this; one click and they're out, which is the law and also just decent.
  token text not null unique default (
    replace(extensions.uuid_generate_v4()::text, '-', '')
    || replace(extensions.uuid_generate_v4()::text, '-', '')
  ),
  unsubscribed_at timestamptz,
  created_at timestamptz default now()
);

create unique index if not exists newsletter_subscribers_email_idx
  on public.newsletter_subscribers (lower(email));

alter table public.newsletter_subscribers enable row level security;

-- Admins of any HIVE can read the list. Nobody can read it anonymously.
drop policy if exists "Admins can read subscribers" on public.newsletter_subscribers;
create policy "Admins can read subscribers" on public.newsletter_subscribers
  for select using (
    exists (
      select 1 from public.community_memberships cm
      where cm.user_id = auth.uid() and cm.role = 'admin'
    )
  );

drop policy if exists "Admins can remove subscribers" on public.newsletter_subscribers;
create policy "Admins can remove subscribers" on public.newsletter_subscribers
  for update using (
    exists (
      select 1 from public.community_memberships cm
      where cm.user_id = auth.uid() and cm.role = 'admin'
    )
  );

-- Signing up. Returns nothing at all: the same silence whether the address was
-- new, already there, or coming back after unsubscribing. That way the form
-- can't be used to find out who is on the list.
create or replace function public.subscribe_to_newsletter(p_email text, p_name text default null)
returns void as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(clean_email) > 254 then
    raise exception 'invalid email';
  end if;

  insert into public.newsletter_subscribers (email, name)
  values (clean_email, clean_name)
  on conflict (lower(email)) do update
    -- Coming back after unsubscribing is a fresh yes.
    set unsubscribed_at = null,
        name = coalesce(excluded.name, public.newsletter_subscribers.name);
end;
$$ language plpgsql security definer set search_path = public;

-- Leaving. True if that key matched somebody, so the page can say so plainly.
create or replace function public.unsubscribe_from_newsletter(p_token text)
returns boolean as $$
declare
  hit boolean;
begin
  update public.newsletter_subscribers
  set unsubscribed_at = coalesce(unsubscribed_at, now())
  where token = p_token
  returning true into hit;

  return coalesce(hit, false);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on public.newsletter_subscribers from anon, authenticated;
revoke all on function public.subscribe_to_newsletter(text, text) from public;
revoke all on function public.unsubscribe_from_newsletter(text) from public;
grant execute on function public.subscribe_to_newsletter(text, text) to anon, authenticated;
grant execute on function public.unsubscribe_from_newsletter(text) to anon, authenticated;

comment on table public.newsletter_subscribers is
  'Newsletter list for people outside the HIVEs. Members come from profiles.email_newsletter_enabled instead; the two are merged and de-duplicated at send time. Anonymous visitors reach this only through subscribe_to_newsletter and unsubscribe_from_newsletter.';

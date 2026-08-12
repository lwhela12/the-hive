-- Everyone can leave, whether or not they have an account
--
-- The newsletter's unsubscribe link only ever worked for `newsletter_subscribers`,
-- because the token lives on that table. Members got a "turn it off in Settings"
-- line instead — pointing at a switch that did not exist until today, and
-- assuming a login the reader may not have. Nat, reading her own test on
-- 2026-08-12: *"that'll only work if you're already a member... they should have
-- a regular unsubscribe button."*
--
-- So members get a token of their own, and one link shape serves everybody.
--
-- The second half matters more than the first. A member who unsubscribed by
-- token would previously have kept getting the newsletter anyway, because
-- `send-newsletter` builds its list from `profiles.email_newsletter_enabled`
-- as well as the subscriber table — leaving them holding a button that
-- visibly did nothing. `unsubscribe_from_newsletter` now turns off whichever
-- of the two the token belongs to, and, when the addresses match, both.

alter table public.profiles
  add column if not exists newsletter_token text;

-- Backfilled for everyone who already exists, and defaulted for everyone after.
update public.profiles
  set newsletter_token = encode(gen_random_bytes(32), 'hex')
  where newsletter_token is null;

alter table public.profiles
  alter column newsletter_token set default encode(gen_random_bytes(32), 'hex');

create unique index if not exists profiles_newsletter_token_idx
  on public.profiles (newsletter_token);

comment on column public.profiles.newsletter_token is
  'Per-member unsubscribe key for The Buzz (migration 171), so a member has the same one-click way out a subscriber has and never needs to log in to stop an email. Never exposed except in the footer of their own newsletter.';

-- Leaving. Returns true if that key matched somebody, so the page can say so
-- plainly. Handles both kinds of reader, and both halves for a member who also
-- signed up publicly — otherwise unsubscribing would clear one list and leave
-- the person on the other.
create or replace function public.unsubscribe_from_newsletter(p_token text)
returns boolean as $$
declare
  clean_token text := nullif(trim(coalesce(p_token, '')), '');
  hit boolean := false;
  who text;
begin
  if clean_token is null then
    return false;
  end if;

  -- A subscriber's own key.
  update public.newsletter_subscribers
    set unsubscribed_at = now()
    where token = clean_token and unsubscribed_at is null
    returning email into who;
  if found then
    hit := true;
  else
    select email into who from public.newsletter_subscribers where token = clean_token;
    if who is not null then
      hit := true;   -- already off; still their key, so still a yes
    end if;
  end if;

  -- A member's own key.
  if who is null then
    update public.profiles
      set email_newsletter_enabled = false
      where newsletter_token = clean_token
      returning email into who;
    if found then hit := true; end if;
  end if;

  -- Whoever it was, make sure the OTHER list lets them go too.
  if who is not null then
    update public.profiles
      set email_newsletter_enabled = false
      where lower(email) = lower(who) and email_newsletter_enabled is not false;
    update public.newsletter_subscribers
      set unsubscribed_at = now()
      where lower(email) = lower(who) and unsubscribed_at is null;
  end if;

  return hit;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.unsubscribe_from_newsletter(text) from public;
grant execute on function public.unsubscribe_from_newsletter(text) to anon, authenticated;

-- An email-code sign-in must not leave a second empty HIVE profile beside the
-- existing member who already uses that address as their contact email.
-- Profile email is not necessarily the Auth email (Sara's Hotmail is an
-- example), so Auth's own identity uniqueness is not enough on its own.
-- The client treats a unique violation as an account-linking stop, never as
-- permission to move memberships or copy another member's content.

do $$
begin
  if exists (
    select 1
    from public.profiles
    where nullif(btrim(email), '') is not null
    group by lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'Cannot guard profile email: duplicate addresses already exist.';
  end if;
end
$$;

create unique index if not exists profiles_one_email_idx
  on public.profiles (lower(btrim(email)))
  where nullif(btrim(email), '') is not null;

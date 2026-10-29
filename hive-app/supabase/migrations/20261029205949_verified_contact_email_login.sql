-- Email sign-in codes travel through HIVE's existing verified mail provider.
-- Only Edge Functions using the service role can see these rate and challenge
-- records. They carry no membership data and cannot be read by members.
create table if not exists public.email_login_send_limits (
  email_hash text primary key,
  window_started_at timestamptz not null default now(),
  sent_count integer not null default 0,
  last_sent_at timestamptz not null default '-infinity'::timestamptz
);
alter table public.email_login_send_limits enable row level security;

create table if not exists public.email_link_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now()
);
alter table public.email_link_challenges enable row level security;

-- The single upsert is atomic under concurrent requests. Service role alone
-- may call this function; no public SECURITY DEFINER lookup is exposed.
create or replace function public.reserve_email_login_send(p_email_hash text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  reserved boolean;
begin
  insert into public.email_login_send_limits
    (email_hash, window_started_at, sent_count, last_sent_at)
  values (p_email_hash, now(), 1, now())
  on conflict (email_hash) do update
    set window_started_at = case
          when email_login_send_limits.window_started_at <= now() - interval '1 hour' then now()
          else email_login_send_limits.window_started_at
        end,
        sent_count = case
          when email_login_send_limits.window_started_at <= now() - interval '1 hour' then 1
          else email_login_send_limits.sent_count + 1
        end,
        last_sent_at = now()
  where email_login_send_limits.last_sent_at <= now() - interval '1 minute'
    and (
      email_login_send_limits.window_started_at <= now() - interval '1 hour'
      or email_login_send_limits.sent_count < 5
    )
  returning true into reserved;

  return coalesce(reserved, false);
end;
$$;

revoke all on function public.reserve_email_login_send(text) from public, anon, authenticated;
grant execute on function public.reserve_email_login_send(text) to service_role;

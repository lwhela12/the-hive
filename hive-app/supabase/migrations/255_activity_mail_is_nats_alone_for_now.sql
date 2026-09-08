-- Nat, 2026-09-08, right after 254 shipped: "not lucas, just me, unless he can
-- toggle it off." No toggle exists yet, so the honest default is off for
-- everyone but her — a column rather than a hardcoded email so a real
-- Settings switch can flip it for Lucas later without another migration.

alter table public.profiles
  add column if not exists email_admin_activity_enabled boolean not null default false;

update public.profiles
  set email_admin_activity_enabled = true
  where email = 'natwalstead@gmail.com';

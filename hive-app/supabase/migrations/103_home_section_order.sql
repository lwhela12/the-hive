-- Per-member home screen section order (Izzy: "upcoming events at the top would be helpful").
-- Null means the default order; the app treats unknown/missing section keys gracefully
-- so adding sections later never breaks a saved layout.

alter table public.profiles
  add column if not exists home_section_order text[];

alter table public.profiles
  add column if not exists profile_title text,
  add column if not exists miq_experiences text,
  add column if not exists miq_growth text,
  add column if not exists miq_contribution text;

alter table public.skills
  add column if not exists enthusiasm_level integer not null default 1 check (enthusiasm_level between 1 and 5),
  add column if not exists display_x numeric(5,4) check (display_x is null or (display_x >= 0 and display_x <= 1)),
  add column if not exists display_y numeric(5,4) check (display_y is null or (display_y >= 0 and display_y <= 1));

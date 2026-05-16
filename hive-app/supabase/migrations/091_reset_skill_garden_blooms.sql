update public.skills
set
  enthusiasm_level = 0,
  display_x = null,
  display_y = null
where
  enthusiasm_level is distinct from 0
  or display_x is not null
  or display_y is not null;

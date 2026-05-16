alter table public.skills
  drop constraint if exists skills_enthusiasm_level_check;

alter table public.skills
  alter column enthusiasm_level set default 0,
  add constraint skills_enthusiasm_level_check
    check (enthusiasm_level between 0 and 5);

-- Per-member customizable home screen shortcut hexes.
-- Null = default ['honey_pot','boards','messages']. Honey Pot was also added to
-- the drawer menu so no destination is reachable only through a shortcut.

alter table public.profiles
  add column if not exists home_shortcuts text[];

-- Every hive gets its own accent colour
--
-- There is going to be more than one HIVE (2026-07-31): the original becomes
-- OG HIVE, and Tech HIVE joins it. Nat and Lucas belong to both, so the app has
-- to answer "which one am I looking at?" without anyone having to think.
--
-- Two things answer it: the hive's name in the gold bar, and this — the colour
-- of the bar itself. The honeycomb, the cream page, and every other piece of the
-- design stay identical in every hive, because the comb IS HIVE. Only the accent
-- moves.
--
-- Null means honey gold (#bd9348), so the existing hive needs no row change and
-- nothing looks different for the people already in it.

alter table public.communities
  add column if not exists accent_color text;

comment on column public.communities.accent_color is
  'Hex colour for this hive''s header bar, e.g. #2f4a63. Null = honey gold (#bd9348), the HIVE default.';

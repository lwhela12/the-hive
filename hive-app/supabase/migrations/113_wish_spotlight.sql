-- Which wish is "this month's HD"?
--
-- Until now this was implicit: whoever's PUBLIC wish was newest won the comb
-- card, the HD page and the meeting deck. That's fine until you hold several
-- wishes and the one you actually want to talk about isn't the one you posted
-- most recently — you had no way to say so (Nat 2026-07-25: "star which one
-- you want... choice is better").
--
-- is_spotlight is that choice. It stays nullable/false everywhere it isn't
-- used, and the app falls back to the old newest-public rule when a member
-- hasn't picked, so nothing changes for anyone who never touches it.

alter table public.wishes
  add column if not exists is_spotlight boolean not null default false;

-- At most one spotlight per member. A partial unique index does the enforcing
-- so a double-tap or a racing device can't leave two wishes starred.
create unique index if not exists wishes_one_spotlight_per_user
  on public.wishes (user_id)
  where is_spotlight;

comment on column public.wishes.is_spotlight is
  'Member-chosen "this month''s HD". When false for all of a member''s wishes, the newest public active wish is used instead.';

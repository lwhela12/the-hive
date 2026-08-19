-- ============================================================================
-- 194 — a card for each HIVE
-- ============================================================================
--
-- Nat, 2026-08-19, voice memo, after the one-card-per-person shape was said
-- out loud: "Yeah — you need to be able to make a new profile in each HIVE if
-- you want it. That may have been the problem all along." And her expected
-- behaviour, verbatim: "if I toggled 'only Tech HIVE sees you' and I hadn't
-- filled anything out in Tech HIVE, then my percentage-complete bee would go
-- back and all of my information would go out — but if I toggled HIVE-Wide on,
-- then it would all come back."
--
-- So the model is:
--
--   profiles           = the TRAVELLING card. One per person. Shown in every
--                        HIVE while profile_scope = 'all_hives'.
--   hive_cards         = one card per (person, HIVE). Shown in that HIVE while
--                        profile_scope = 'hive'. A HIVE you never filled out
--                        is honestly blank there.
--
-- Name, phone, birthday, avatar and preferences stay on `profiles` always —
-- they are facts about the person, not about a face they show one room.
--
-- The seed copies each person's current card into the HIVE they joined FIRST,
-- because that is where they wrote it: Nat's and Charlee's cards were written
-- as OG cards, sara knauer's as a Production one, Kelly's as Tech's. Nobody's
-- card disappears from the room it was written in when they flip the switch —
-- it disappears (deliberately, her spec) from the rooms it was never written
-- for.

create table if not exists public.hive_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_title text,
  bio text,
  known_for text,
  hometown text,
  current_project text,
  favorite_book text,
  favorite_food text,
  favorite_hobby text,
  fun_facts text[],
  miq_experiences text,
  miq_growth text,
  miq_contribution text,
  updated_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

comment on table public.hive_cards is
  'One profile card per person per HIVE, shown while the owner''s profile_scope is ''hive''. The travelling card (profile_scope = ''all_hives'') lives on profiles itself. Migration 194.';

alter table public.hive_cards enable row level security;

-- A per-HIVE card is for that HIVE's people (plus its owner, wherever they
-- stand). It never travels — travelling is what the profiles row is for.
create policy "Hive cards viewable inside their HIVE" on public.hive_cards
  for select using (
    auth.uid() = user_id or is_community_member(community_id)
  );

create policy "Members write their own hive card" on public.hive_cards
  for insert with check (
    auth.uid() = user_id and is_community_member(community_id)
  );

create policy "Members update their own hive card" on public.hive_cards
  for update using (auth.uid() = user_id);

create policy "Members delete their own hive card" on public.hive_cards
  for delete using (auth.uid() = user_id);

-- Seed: everyone's current card lands in their first-joined HIVE.
insert into public.hive_cards (
  user_id, community_id, profile_title, bio, known_for, hometown,
  current_project, favorite_book, favorite_food, favorite_hobby, fun_facts,
  miq_experiences, miq_growth, miq_contribution
)
select
  p.id, first_hive.community_id, p.profile_title, p.bio, p.known_for,
  p.hometown, p.current_project, p.favorite_book, p.favorite_food,
  p.favorite_hobby, p.fun_facts, p.miq_experiences, p.miq_growth,
  p.miq_contribution
from public.profiles p
join lateral (
  select cm.community_id
  from public.community_memberships cm
  where cm.user_id = p.id
  order by cm.created_at asc
  limit 1
) first_hive on true
on conflict (user_id, community_id) do nothing;

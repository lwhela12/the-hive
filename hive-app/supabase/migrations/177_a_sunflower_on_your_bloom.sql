-- Garden visits (Nat's parked idea, built 2026-08-12): a member visiting
-- someone ELSE's skills garden can leave a little 🌻 on one of their blooms —
-- "I was here and this one's lovely." The bloom's owner sees the sunflowers
-- that gathered next time they look at their garden. No notifications; the
-- discovery IS the feature.
--
-- One sunflower per person per bloom — tapping again takes it back, so the
-- unique key is also the toggle.

create table public.skill_flowers (
  id uuid default gen_random_uuid() primary key,
  skill_id uuid not null references public.skills(id) on delete cascade,
  giver_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (skill_id, giver_id)
);

alter table public.skill_flowers enable row level security;

-- Who sees the flowers: exactly the people who can see the bloom they sit on.
-- Skills are visible to members of the skill's HIVE (migration 004), so the
-- flower borrows that same check rather than inventing its own audience.
create policy "Flowers visible with the garden" on public.skill_flowers
  for select using (
    exists (
      select 1 from public.skills s
      where s.id = skill_id
        and public.is_community_member(s.community_id)
    )
  );

-- Leaving one: only as yourself, only on a bloom you can see, and never on
-- your own — a sunflower is a visitor's mark, not a self-award.
create policy "Leave a flower on someone else's bloom" on public.skill_flowers
  for insert with check (
    auth.uid() = giver_id
    and exists (
      select 1 from public.skills s
      where s.id = skill_id
        and s.user_id <> auth.uid()
        and public.is_community_member(s.community_id)
    )
  );

-- Taking it back: only your own. Nobody deletes anyone else's flower —
-- not even the bloom's owner (reseeding the skill cascades them away).
create policy "Take your own flower back" on public.skill_flowers
  for delete using (auth.uid() = giver_id);

-- No update policy on purpose: a flower is left or taken back, never edited.

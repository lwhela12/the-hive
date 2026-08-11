-- The onboarding tour happens once, per member, per HIVE
--
-- Nat, 2026-08-11: "lets make an onboarding wizard for each HIVE. It links
-- to your first welcome email & its skippable & never comes back."
--
-- "Never comes back" has to survive a new browser, a phone, a cleared
-- cache — so it lives here, not in localStorage. One row = this member has
-- seen (or skipped) this HIVE's tour; skipping and finishing both write the
-- same row, because either way the answer to "show it again?" is no.

create table if not exists public.tour_marks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  completed_at timestamptz not null default now(),
  -- 'finished' walked every step; 'skipped' tapped out early. Same effect,
  -- kept apart so Nat can one day see whether anyone actually walks it.
  outcome text not null default 'finished' check (outcome in ('finished', 'skipped')),
  primary key (user_id, community_id)
);

alter table public.tour_marks enable row level security;

create policy "You see your own tour marks" on public.tour_marks
  for select using (auth.uid() = user_id);

create policy "You mark your own tour" on public.tour_marks
  for insert with check (auth.uid() = user_id);

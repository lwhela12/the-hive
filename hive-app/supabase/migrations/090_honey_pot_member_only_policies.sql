-- Keep Honey Pot money data transparent inside the community only.
-- RLS policies combine permissively, so explicitly remove the older
-- authenticated-user policies before recreating the community-scoped ones.

drop policy if exists "Honey pot viewable by all" on public.honey_pot;
drop policy if exists "Transactions viewable by all" on public.honey_pot_transactions;

drop policy if exists "Honey pot viewable by members" on public.honey_pot;
create policy "Honey pot viewable by members" on public.honey_pot
  for select using (public.is_community_member(community_id));

drop policy if exists "Transactions viewable by members" on public.honey_pot_transactions;
create policy "Transactions viewable by members" on public.honey_pot_transactions
  for select using (public.is_community_member(community_id));

drop policy if exists "Treasurer can update honey pot" on public.honey_pot;
create policy "Treasurer can update honey pot" on public.honey_pot
  for update using (public.is_community_treasurer(community_id));

drop policy if exists "Treasurer can insert honey pot" on public.honey_pot;
create policy "Treasurer can insert honey pot" on public.honey_pot
  for insert with check (public.is_community_treasurer(community_id));

drop policy if exists "Treasurer can add transactions" on public.honey_pot_transactions;
create policy "Treasurer can add transactions" on public.honey_pot_transactions
  for insert with check (public.is_community_treasurer(community_id));

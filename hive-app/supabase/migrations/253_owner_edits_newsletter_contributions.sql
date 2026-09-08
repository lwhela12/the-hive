-- The HIVE-Wide Newsletter worktop is Nat's editorial desk. An optional
-- “For the Buzz” answer or legacy newsletter-board reply needs the same
-- correction/removal control as a private quick-add thought, without deleting
-- the rest of someone’s survey response.

grant update on public.survey_responses, public.board_replies to authenticated;

drop policy if exists "owners edit newsletter survey contributions" on public.survey_responses;
create policy "owners edit newsletter survey contributions"
  on public.survey_responses for update
  to authenticated
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

drop policy if exists "owners edit newsletter board contributions" on public.board_replies;
create policy "owners edit newsletter board contributions"
  on public.board_replies for update
  to authenticated
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

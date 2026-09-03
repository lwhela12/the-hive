-- One End of the month, for everybody, belonging to no single HIVE.
--
-- Nat, 2026-09-02: *"we need one singular 'end of month' check-in survey. We
-- need to make that, cos that's what I'll send out to everyone."* And the idea
-- underneath it, from earlier the same evening: *"maybe we make one survey that
-- goes out to everyone HIVE-Wide, and if you're in multiple HIVEs you only get
-- one email... fewer surveys. That's a freaking great idea."*
--
-- It is. Today there are ten live survey rows carrying six names, and a member
-- of three HIVEs gets three of everything. This is the first half of collapsing
-- that: `community_id` may now be NULL, and NULL means HIVE-Wide — the same
-- thing it means everywhere else in this app, a place above the HIVEs rather
-- than a fourth one.
--
-- **Nullable, not a sentinel row.** A pretend "HIVE-Wide community" would have
-- to be excluded by hand from every members list, every colour lookup, every
-- ceiling check and every count on the grid, and one missed exclusion is a
-- fourth HIVE appearing in Nat's app. NULL fails the other way: every existing
-- `.eq('community_id', x)` simply does not match it, so nothing that reads
-- surveys today can be surprised by one. They have to opt in.
--
-- Both policies are widened by exactly one clause each, and both keep the
-- "standing somewhere in HIVE" floor that `hive_wide_meeting_days` uses.

alter table public.surveys alter column community_id drop not null;
alter table public.survey_responses alter column community_id drop not null;

comment on column public.surveys.community_id is
  'The HIVE this check-in belongs to. NULL means HIVE-Wide — one survey for everybody, no single HIVE. Nothing that filters by a specific HIVE will match it, which is deliberate: reading it is opt-in.';

-- --------------------------------------------------------------------------
-- Seeing it
-- --------------------------------------------------------------------------
--
-- A HIVE-Wide survey is readable by anybody standing anywhere in HIVE. Same
-- gate the HIVE-Wide calendar uses: you have to be inside before you can see
-- the street.

drop policy if exists "Surveys viewable by your HIVE" on public.surveys;
create policy "Surveys viewable by your HIVE"
  on public.surveys for select
  using (
    is_community_member(community_id)
    or (community_id is null and is_any_community_member())
  );

-- --------------------------------------------------------------------------
-- Answering it, and reading the answers
-- --------------------------------------------------------------------------
--
-- An answer to a HIVE-Wide survey has no HIVE either, so `is_community_member`
-- can say nothing about it. Two people may read it: the person who wrote it,
-- which the first clause already covers, and the HIVE owner — because these
-- answers are what she writes The Buzz from, and a newsletter ask nobody can
-- read is a question with nowhere to go.
--
-- Deliberately NOT every member: "how did your month go" is a personal answer
-- even when the question next to it is about the newsletter. The existing
-- `share_scope` clause still lets somebody open their own answer wider.

drop policy if exists "Survey responses viewable by scope" on public.survey_responses;
create policy "Survey responses viewable by scope"
  on public.survey_responses for select
  using (
    auth.uid() = user_id
    or is_community_member(community_id)
    or (share_scope = any (array['all_hives'::text, 'public'::text]))
    or (community_id is null and is_hive_owner())
  );

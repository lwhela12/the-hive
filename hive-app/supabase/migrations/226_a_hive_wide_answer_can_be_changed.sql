-- You can change your mind about a HIVE-Wide answer.
--
-- Migration 225 made `survey_responses.community_id` nullable and widened the
-- two SELECT policies. It missed the UPDATE policy, which still reads:
--
--     with check (auth.uid() = user_id and is_community_member(community_id))
--
-- `is_community_member(null)` is FALSE — not an error, not true — so an answer
-- with no HIVE could be written once and never touched again.
--
-- That matters more than it looks, because the client submits with
-- `upsert(..., { onConflict: 'survey_id,user_id,response_period' })`, and
-- Postgres applies the UPDATE `with check` on conflict. So the SECOND submit of
-- an End of the month answer — a correction, a change of mind, or simply
-- re-opening the link and pressing Save again — failed with 42501 and the
-- member saw "Could not save your responses. Please try again." forever.
--
-- Found by an audit before anybody hit it, and proved in a rolled-back
-- transaction as a real non-owner member: first insert succeeded, the identical
-- upsert failed. Nothing had gone out yet.
--
-- The USING clause stays `auth.uid() = user_id`: whose answer it is has always
-- been the whole question for an edit, and a HIVE has never been part of it.

drop policy if exists "Users can update own responses" on public.survey_responses;
create policy "Users can update own responses"
  on public.survey_responses for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (community_id is null or is_community_member(community_id))
  );

-- Clive gets its memory back, with a fence around it this time
--
-- Migration 131 closed context_summaries by revoking it from anon and
-- authenticated outright. That shut the hole — the table had been readable AND
-- writable by anyone holding the published key — but it also shut Clive, and I
-- didn't notice until I went looking for what I might have broken.
--
-- The reason is worth writing down, because it is not obvious from the table:
-- the chat function does NOT run as the server. It builds its client with the
-- anon key plus the caller's own token (supabase/functions/chat/index.ts, where
-- supabaseClient is created), so every read and write it makes arrives as the
-- signed-in member. Revoking `authenticated` therefore revoked Clive.
--
-- "No access" was never the right answer anyway — the right answer is the same
-- one as everywhere else in this app: you may touch what belongs to you, and
-- what belongs to a HIVE you are actually in.
--
--   conversation rows carry a user_id -- they summarise a private chat, so they
--                     belong to that person and nobody else, not even their
--                     HIVE's admin.
--   everything else   is about a community's boards or meetings, so it belongs
--                     to the members of that community.

grant select, insert, update, delete on public.context_summaries to authenticated;

drop policy if exists "Only the server touches Clive's memory" on public.context_summaries;

-- The server keeps its own way in, for the jobs that run with nobody signed in.
create policy "The server can always reach Clive's memory"
  on public.context_summaries for all
  to service_role
  using (true) with check (true);

create policy "Your own summaries, and your own HIVEs"
  on public.context_summaries for select
  to authenticated
  using (
    case
      when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id)
    end
  );

-- Same rule for writing. Clive rewrites these constantly as conversations grow,
-- so it needs all three verbs — but only over rows it could already read.
create policy "Clive writes summaries where you are"
  on public.context_summaries for insert
  to authenticated
  with check (
    case
      when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id)
    end
  );

create policy "Clive updates summaries where you are"
  on public.context_summaries for update
  to authenticated
  using (
    case
      when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id)
    end
  )
  with check (
    case
      when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id)
    end
  );

-- Deleting is how the cache is invalidated when a board changes
-- (invalidateActionContext in the chat function), so it is ordinary use.
create policy "Clive clears summaries where you are"
  on public.context_summaries for delete
  to authenticated
  using (
    case
      when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id)
    end
  );

-- Still true, and still the reason this table matters: a summary of a private
-- conversation is the most personal thing in the database. If Clive is ever
-- given the ability to read across a person's HIVEs, this policy stops being
-- enough on its own — the row would be legitimately theirs and still contain
-- something told to it in a different room. That one is open (2026-08-03).

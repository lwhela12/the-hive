-- Everybody's screen learns who took what, the moment they take it.
--
-- Nat, describing the room the first Production HIVE actually was
-- (2026-08-19): *"we're all sitting in front of our computers ... it was like,
-- okay, who wants what? It's like, me, I'll take this one. Me, I'll take this
-- one. And it's like, wait, you can't do it, only I can — that feels weird."*
--
-- Assigning was never restricted to the presenter. SEEING it was: the deck's
-- jobs panel only knew what it had done itself, so three people took jobs on
-- three laptops and none of them could see the other two. The panel listens to
-- this table now, which it cannot do unless the table is published.
--
-- `deck_sessions` (migration 182) was added to this publication for the same
-- reason — the deck moving for everyone — and this is the other half of it:
-- the deck's LAST slide moving for everyone.
--
-- Row-level security still decides what any one person receives. Publishing a
-- table does not widen who may read it; it only lets the people who already
-- may read it hear about a change without asking again.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'action_items'
  ) then
    alter publication supabase_realtime add table public.action_items;
  end if;
end $$;

-- One person drives the deck. Everybody else's deck follows.
--
-- Nat, 2026-08-15, describing the dining room as it actually works: *"we have a
-- dining room table that faces a frame TV built into the wall ... I'm standing
-- at one end of the table and then I have my laptop on a stand ... and then I
-- usually cast my meeting helper to the TV so everyone can follow along."*
-- Which works until somebody is remote, or the room is a restaurant, or the TV
-- is behind the wrong shoulder.
--
-- Her ask: *"when I click next, it goes next for everyone ... if we're all in
-- there together, then you can either watch up on the TV or if we're like at a
-- restaurant or something, you can follow along on your phone because it'll
-- click along as I click along."*
--
-- The Meeting Helper was already open to every member — it says so on the tile,
-- "follow along from any seat" — but every seat kept its own slide. This is the
-- one row that makes them one deck.
--
-- Shape notes:
--
-- * **One live session per HIVE**, so `community_id` is the primary key. Two
--   people cannot both be presenting OG's deck; the second one to press
--   Present takes the wheel, and the first one's screen starts following.
--   That is the same social rule as a real room — whoever is standing up is
--   the one talking.
--
-- * **We store the slide KEY, not its number.** `DECKS` in meeting-helper.tsx
--   gives each HIVE a named list ('room', 'outline', 'news', …). Numbers would
--   be a promise that everyone's deck is the same length forever; keys survive
--   a slide being added to one HIVE's list and not another's, and they survive
--   a follower on a stale bundle. If a key means nothing to the deck you are
--   holding, your slide simply does not move.
--
-- * **No history.** This is where the room is standing right now, and when the
--   meeting ends the row goes away. Meetings keep their record in `meetings`
--   and the notes seal themselves on the Wrap-Up slide; this table is furniture.

create table if not exists public.deck_sessions (
  community_id uuid primary key references public.communities(id) on delete cascade,
  presenter_id uuid not null references public.profiles(id) on delete cascade,
  slide_key text not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deck_sessions is
  'The one live Meeting Helper session for a HIVE: who is driving the deck and which slide the room is on. Deleted when they stop presenting.';
comment on column public.deck_sessions.slide_key is
  'A DeckSlideKey from meeting-helper.tsx (room, outline, news, …). A key, never an index, so a follower on a different-length deck still lands on the right slide.';

alter table public.deck_sessions enable row level security;

-- Anyone in the HIVE can see where the room is standing — that is the whole
-- point of following along.
drop policy if exists "Members see their hive's deck session" on public.deck_sessions;
create policy "Members see their hive's deck session"
  on public.deck_sessions for select
  using (public.is_community_member(community_id));

-- Any member can pick up the deck (Nat drives OG, but Lucas runs Tech and
-- whoever is in the room runs Production's opening jobs). You can only ever
-- present as yourself.
drop policy if exists "Members can present their hive's deck" on public.deck_sessions;
create policy "Members can present their hive's deck"
  on public.deck_sessions for insert
  with check (
    public.is_community_member(community_id)
    and presenter_id = auth.uid()
  );

-- Advancing the deck, and taking the wheel from someone who wandered off: the
-- row already exists, so both are updates. `with check` keeps the new presenter
-- honest about who they are.
drop policy if exists "Members can move their hive's deck" on public.deck_sessions;
create policy "Members can move their hive's deck"
  on public.deck_sessions for update
  using (public.is_community_member(community_id))
  with check (
    public.is_community_member(community_id)
    and presenter_id = auth.uid()
  );

-- Ending the meeting. Any member can close a session that got left open —
-- a laptop that shut mid-meeting should not leave the whole HIVE following a
-- slide nobody is standing on.
drop policy if exists "Members can end their hive's deck session" on public.deck_sessions;
create policy "Members can end their hive's deck session"
  on public.deck_sessions for delete
  using (public.is_community_member(community_id));

-- Followers hear about the move over Realtime rather than polling, the same way
-- room messages and typing indicators already do.
do $$
begin
  alter publication supabase_realtime add table public.deck_sessions;
exception
  when duplicate_object then null;
end
$$;

-- HIVE-Wide Messages gets somewhere to type.
--
-- The room has been on screen since 2026-08-03 with an honest sign in the
-- middle of it saying it was still being built. It was: `chat_rooms.community_id`
-- is NOT NULL and every policy on the table keys off membership of that one
-- HIVE, so a room belonging to all of them had nowhere to exist.
--
-- Same answer as the shared boards got the same day, deliberately. A board that
-- reaches every HIVE is one row hosted under OG with `reach = 'all_hives'`,
-- guarded by community_shares_beyond_hive() + is_any_community_member(). Rooms
-- now work the same way, so there is one idea to learn instead of two, and the
-- next thing that needs to cross HIVEs already has a pattern.
--
-- WHAT THIS OPENS: one room. Any member of any HIVE can read it and post in it.
-- WHAT IT DOES NOT: every other room. A HIVE's own General is still shut to
-- everybody outside that HIVE — those policies are untouched below.
--
-- ON PRODUCTION HIVE, WHOSE CEILING IS 'hive': its members can still read and
-- write here. That is not a leak of Production's contents — max_share_scope
-- governs what a HIVE publishes outward, and nothing in Production is being
-- published by this. It is a person choosing to say something in a room they
-- know is shared, which is exactly the choice the boards decision already made
-- on 2026-08-03. Their HIVE's own room stays sealed.
--
-- MESSAGES ARE NOT LABELLED WITH THE SENDER'S HIVE, and that is a privacy
-- decision, not an omission. Being listed at HIVE-Wide is opt-in per person
-- (profiles.visible_hive_wide, migration 135, default false). Stamping "from
-- Tech HIVE" beside somebody's message would announce a membership they had
-- deliberately not announced. So a wide-room message carries the ROOM's
-- community_id, like every other message carries its room's.

-- 1. A room can now say how far it reaches.
alter table public.chat_rooms
  add column if not exists reach text not null default 'hive'
  check (reach in ('hive', 'all_hives'));

comment on column public.chat_rooms.reach is
  'hive = only that HIVE''s members (every room until now). all_hives = any member of any HIVE, subject to the host HIVE''s max_share_scope. Mirrors board_categories.reach.';

-- 2. The room itself. Hosted under OG because the shared boards are, and a row
--    has to live somewhere; `reach` is what makes it everybody's, not its host.
--    Idempotent so re-running this file cannot make a second one.
insert into public.chat_rooms (community_id, room_type, name, description, reach)
select
  (select id from public.communities where slug = 'default'),
  'community',
  'HIVE-Wide',
  'Every HIVE, in one room',
  'all_hives'
where not exists (
  select 1 from public.chat_rooms where reach = 'all_hives' and room_type = 'community'
);

-- 3. Seeing the room.
create policy "The shared room is visible to every HIVE"
  on public.chat_rooms for select
  using (
    reach = 'all_hives'
    and public.is_any_community_member()
    and public.community_shares_beyond_hive(community_id)
  );

-- 4. Reading what is said in it.
create policy "The shared room's messages are readable across HIVEs"
  on public.room_messages for select
  using (
    exists (
      select 1 from public.chat_rooms r
      where r.id = room_messages.room_id
        and r.reach = 'all_hives'
        and public.community_shares_beyond_hive(r.community_id)
    )
    and public.is_any_community_member()
  );

-- 5. Saying something in it.
--
-- community_id must match the room's own. Without that check a member could
-- post a wide-room message stamped with any community id they liked, and every
-- screen that groups messages by HIVE would believe it.
create policy "Any HIVE's member can post in the shared room"
  on public.room_messages for insert
  with check (
    auth.uid() = sender_id
    and public.is_any_community_member()
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_messages.room_id
        and r.reach = 'all_hives'
        and r.community_id = room_messages.community_id
        and public.community_shares_beyond_hive(r.community_id)
    )
  );

-- 6. Reactions. The existing policy joins a message's room to the reader's
--    membership OF THAT ROOM'S HIVE, so without this a Tech member would see an
--    OG member's hearts vanish in a room they are both standing in.
create policy "Reactions in the shared room are visible across HIVEs"
  on public.message_reactions for select
  using (
    exists (
      select 1
      from public.room_messages m
      join public.chat_rooms r on r.id = m.room_id
      where m.id = message_reactions.message_id
        and r.reach = 'all_hives'
        and public.community_shares_beyond_hive(r.community_id)
    )
    and public.is_any_community_member()
  );

-- 7. Renaming or restyling your own copy of a room (chat_room_members carries
--    custom_title and friends) needs a row to hang off. Members join the shared
--    room lazily from the app; nothing here forces a row on anybody.
create policy "You can join the shared room yourself"
  on public.chat_room_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms r
      where r.id = chat_room_members.room_id
        and r.reach = 'all_hives'
        and public.community_shares_beyond_hive(r.community_id)
    )
    and public.is_any_community_member()
  );

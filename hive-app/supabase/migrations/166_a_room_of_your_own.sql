-- A chat with yourself
--
-- Nat, 2026-08-11, on Tech HIVE's member rail: her own bubble should sit
-- with the other members' — and tapping a member's bubble opens a chat, so
-- tapping your own opens a private notes-to-self space (the same pattern
-- Slack ships as "message yourself").
--
-- `get_or_create_dm_room` was built for two different people: its membership
-- guard counts DISTINCT user ids (a self-chat counts 1, not 2), its lookup
-- requires exactly 2 member rows, and its insert writes the same
-- (room, user) row twice, tripping the unique constraint. This teaches it
-- the one-person case instead of adding a second function: a self-room is a
-- `dm` room whose only member is you, found by "I'm in it and it has exactly
-- one member row."

create or replace function public.get_or_create_dm_room(
  p_community_id uuid, p_user1_id uuid, p_user2_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room_id uuid;
  v_is_self boolean := p_user1_id = p_user2_id;
begin
  -- Guard added 2026-08-03. This is security definer, so row-level security
  -- never runs inside it, and it used to take both participants from its
  -- arguments without once asking who was calling.
  if auth.uid() is null
     or (auth.uid() <> p_user1_id and auth.uid() <> p_user2_id) then
    raise exception 'You can only start a conversation you are part of.' using errcode = '42501';
  end if;
  if not public.is_community_member(p_community_id) then
    raise exception 'You can only start a conversation you are part of.' using errcode = '42501';
  end if;
  if (select count(distinct user_id) from public.community_memberships
       where community_id = p_community_id and user_id in (p_user1_id, p_user2_id))
     <> (case when v_is_self then 1 else 2 end) then
    raise exception 'Both people have to be in this HIVE.' using errcode = '42501';
  end if;

  if v_is_self then
    -- Your notes-to-self room: a dm room you are in whose member count is 1.
    select r.id into v_room_id
    from public.chat_rooms r
    where r.community_id = p_community_id
      and r.room_type = 'dm'
      and exists (
        select 1 from public.chat_room_members m1
        where m1.room_id = r.id and m1.user_id = p_user1_id
      )
      and (
        select count(*) from public.chat_room_members m
        where m.room_id = r.id
      ) = 1
    limit 1;

    if v_room_id is null then
      insert into public.chat_rooms (community_id, room_type, created_by)
      values (p_community_id, 'dm', p_user1_id)
      returning id into v_room_id;

      insert into public.chat_room_members (room_id, user_id)
      values (v_room_id, p_user1_id);
    end if;

    return v_room_id;
  end if;

  -- Find existing DM room between these two users
  select r.id into v_room_id
  from public.chat_rooms r
  where r.community_id = p_community_id
    and r.room_type = 'dm'
    and exists (
      select 1 from public.chat_room_members m1
      where m1.room_id = r.id and m1.user_id = p_user1_id
    )
    and exists (
      select 1 from public.chat_room_members m2
      where m2.room_id = r.id and m2.user_id = p_user2_id
    )
    and (
      select count(*) from public.chat_room_members m
      where m.room_id = r.id
    ) = 2
  limit 1;

  -- If not found, create new room
  if v_room_id is null then
    insert into public.chat_rooms (community_id, room_type, created_by)
    values (p_community_id, 'dm', p_user1_id)
    returning id into v_room_id;

    -- Add both users as members
    insert into public.chat_room_members (room_id, user_id)
    values (v_room_id, p_user1_id), (v_room_id, p_user2_id);
  end if;

  return v_room_id;
end;
$function$;

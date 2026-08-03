-- The master key, and the four doors it opened
--
-- Found by an adversarial audit on 2026-08-03, before the second and third
-- HIVEs had anybody in them. Nothing here had been used; all of it could have
-- been, by any signed-in member, from a browser console.
--
-- THE CHAIN, in the order it unlocked:
--
--   1. "Users can update own profile" was `using (auth.uid() = id)` with no
--      WITH CHECK and no column list. Postgres reuses USING as the check, so a
--      member could run `update profiles set role='admin' where id=auth.uid()`
--      and it passed.
--   2. is_community_admin() believed that column: `cm.role='admin' OR
--      p.role='admin'`. So step 1 made them a real admin, in the database, of
--      every HIVE they belonged to.
--   3. "Community admins can update" on communities has no column guard, so
--      that member could then set their own HIVE's max_share_scope. The ceiling
--      built on Saturday to survive a mis-tapped setting was editable by the
--      people it was meant to bound.
--   4. Being an admin also satisfied the newsletter_subscribers policy, which
--      keys on `cm.role='admin'` in ANY community — handing over the whole
--      subscriber list, people who are in no HIVE at all.
--
-- The fix is in three parts: stop the self-promotion, stop authorising from a
-- column the subject can write, and guard the columns that decide reach.
--
-- Guards are triggers rather than WITH CHECK clauses because the question is
-- "did this value CHANGE, and by whom" — a policy only ever sees the new row.

-- ---------------------------------------------------------------------------
-- 1. Nobody promotes themselves
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     or new.is_owner is distinct from old.is_owner then
    -- A null auth.uid() means this is server-side: a migration, or an edge
    -- function holding the service key. That key is already total power, so
    -- refusing it here would buy nothing and would lock us out of our own
    -- admin tools. The check that matters is the one on a signed-in person.
    if auth.uid() is not null and not public.is_hive_owner() then
      raise exception 'Roles are set by the HIVE owner.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

comment on function public.guard_profile_privileges is
  'Everything else on your profile is yours to edit. Your role and whether you are an owner are not.';

-- ---------------------------------------------------------------------------
-- 2. Admin comes from the HIVE you are in, never from a column you can write
-- ---------------------------------------------------------------------------
--
-- profiles.role is legacy: it predates multi-HIVE, when there was one community
-- and a global role made sense. It is 'member' for all twelve people today, so
-- dropping it out of this check takes nothing away from anyone. Real admin
-- lives on community_memberships, per HIVE, which is also the only shape that
-- makes sense once there are three.

create or replace function public.is_community_admin(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = c_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  ) or public.is_hive_owner();
$$;

comment on function public.is_community_admin is
  'Admin of THIS HIVE, from community_memberships. Owners pass everywhere. Deliberately ignores profiles.role, which the person it describes can edit.';

-- ---------------------------------------------------------------------------
-- 3. The ceiling is the owner's to move
-- ---------------------------------------------------------------------------
--
-- A HIVE admin should run their HIVE — rename it, set its colour, manage its
-- people. How far its contents may travel is a different kind of decision, and
-- Production HIVE's promise that nothing leaves is not something its own
-- members should be able to switch off.

create or replace function public.guard_community_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.max_share_scope is distinct from old.max_share_scope then
    if not public.is_hive_owner() then
      raise exception 'How far a HIVE shares is set by the HIVE owner.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_community_ceiling on public.communities;
create trigger guard_community_ceiling
  before update on public.communities
  for each row execute function public.guard_community_ceiling();

-- ---------------------------------------------------------------------------
-- 4. Nobody publishes to the-hive.app but the owner
-- ---------------------------------------------------------------------------
--
-- "Authors can update own posts" constrains author_id and nothing else. A
-- member could start a thread on the HIVE Newsletter board — which migration
-- 114 created without requires_admin, so it defaulted to open — set its
-- visibility to 'public', and satisfy every condition of the public_newsletters
-- view. Their words then appeared on the-hive.app under the HIVE's name, edge
-- cached for five minutes, with nobody in the loop.
--
-- Members keep the one visibility choice that was always meant to be theirs:
-- marking their own HIVE Help focus public (migration 119, "a focus goes public
-- because a member said so, never because nobody said otherwise").

update public.board_categories
   set requires_admin = true
 where topic_kind = 'newsletter';

create or replace function public.guard_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' and new.visibility is not distinct from old.visibility then
    return new;
  end if;

  if new.visibility is distinct from 'public' then
    return new;
  end if;

  if public.is_hive_owner() then
    return new;
  end if;

  select bc.topic_kind into v_kind
    from public.board_categories bc
   where bc.id = new.category_id;

  -- The member-facing exception, and the only one.
  if v_kind = 'helper_log' and new.author_id = auth.uid() then
    return new;
  end if;

  raise exception 'Posts are published outward by the HIVE owner.'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_post_visibility on public.board_posts;
create trigger guard_post_visibility
  before insert or update on public.board_posts
  for each row execute function public.guard_post_visibility();

-- ---------------------------------------------------------------------------
-- 5. You cannot add yourself to somebody else's conversation
-- ---------------------------------------------------------------------------
--
-- "Users can manage own membership" was `for all using (auth.uid() = user_id)`
-- with no WITH CHECK, so the only thing an INSERT had to satisfy was that the
-- row named you. room_id was unconstrained. Insert yourself into any room —
-- including a DM between two other people — and the messages policy then
-- returned its entire history, and let you post into it.
--
-- The app never inserts here. Rooms are made by get_or_create_dm_room and
-- get_or_create_group_dm_room, which are security definer and do their own
-- inserting, so taking this away from the client costs nothing.

drop policy if exists "Users can manage own membership" on public.chat_room_members;

create policy "You can see rooms you are in"
  on public.chat_room_members for select
  using (public.is_community_member_for_room(room_id));

create policy "You can leave a room"
  on public.chat_room_members for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. The chat functions stop taking the caller's word for who they are
-- ---------------------------------------------------------------------------
--
-- All three are SECURITY DEFINER, so row-level security never runs inside them,
-- and all three took the identity to act as from their arguments. None called
-- auth.uid() even once. get_chat_rooms_with_data would hand any signed-in
-- person another HIVE's rooms, its members' names and email addresses, and the
-- last message in each DM — which is most of what a private HIVE is.

-- The three bodies below are the live definitions with a guard spliced in after
-- BEGIN and search_path pinned. Everything else is byte-identical on purpose:
-- this is a security fix, not a rewrite, and the working logic should not move.

CREATE OR REPLACE FUNCTION public.get_or_create_dm_room(p_community_id uuid, p_user1_id uuid, p_user2_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room_id uuid;
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
       where community_id = p_community_id and user_id in (p_user1_id, p_user2_id)) <> 2 then
    raise exception 'Both people have to be in this HIVE.' using errcode = '42501';
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_group_dm_room(p_community_id uuid, p_user_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_id uuid;
  v_sorted_user_ids uuid[];
  v_user_count int;
  v_user_id uuid;
BEGIN
  -- Guard added 2026-08-03. Same shape as get_or_create_dm_room, same fix.
  IF auth.uid() IS NULL OR NOT (auth.uid() = ANY(p_user_ids)) THEN
    RAISE EXCEPTION 'You can only start a conversation you are part of.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_community_member(p_community_id) THEN
    RAISE EXCEPTION 'You can only start a conversation you are part of.' USING ERRCODE = '42501';
  END IF;
  IF (select count(distinct user_id) from public.community_memberships
       where community_id = p_community_id and user_id = ANY(p_user_ids))
     <> (select count(distinct u) from unnest(p_user_ids) u) THEN
    RAISE EXCEPTION 'Everyone has to be in this HIVE.' USING ERRCODE = '42501';
  END IF;
  -- Validate input
  v_user_count := array_length(p_user_ids, 1);
  IF v_user_count IS NULL OR v_user_count < 2 THEN
    RAISE EXCEPTION 'Group DM requires at least 2 users';
  END IF;

  -- Sort user IDs for consistent comparison
  SELECT array_agg(uid ORDER BY uid) INTO v_sorted_user_ids
  FROM unnest(p_user_ids) AS uid;

  -- Find existing group DM room with exact same participants
  SELECT r.id INTO v_room_id
  FROM public.chat_rooms r
  WHERE r.community_id = p_community_id
    AND r.room_type = 'group_dm'
    AND (
      -- Room has exact same number of members as requested
      SELECT count(*) FROM public.chat_room_members m WHERE m.room_id = r.id
    ) = v_user_count
    AND (
      -- All requested users are members of this room
      SELECT count(*) FROM public.chat_room_members m
      WHERE m.room_id = r.id AND m.user_id = ANY(v_sorted_user_ids)
    ) = v_user_count
  LIMIT 1;

  -- If not found, create new group DM room
  IF v_room_id IS NULL THEN
    INSERT INTO public.chat_rooms (community_id, room_type, created_by)
    VALUES (p_community_id, 'group_dm', v_sorted_user_ids[1])
    RETURNING id INTO v_room_id;

    -- Add all users as members
    FOREACH v_user_id IN ARRAY v_sorted_user_ids
    LOOP
      INSERT INTO public.chat_room_members (room_id, user_id)
      VALUES (v_room_id, v_user_id);
    END LOOP;
  END IF;

  RETURN v_room_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_rooms_with_data(p_community_id uuid, p_user_id uuid)
 RETURNS TABLE(room_id uuid, room_community_id uuid, room_type chat_room_type, room_name text, room_description text, room_created_by uuid, room_created_at timestamp with time zone, custom_title text, custom_emoji text, custom_image_url text, custom_background text, custom_background_image_url text, members jsonb, last_message jsonb, unread_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Guard added 2026-08-03. The arguments stay, for the app's sake, but they are
  -- now checked rather than believed. Unchecked, this handed any signed-in
  -- person another HIVE's rooms, its members' names and email addresses, and
  -- the last message in each DM -- most of what a private HIVE is.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id
     OR NOT public.is_community_member(p_community_id) THEN
    RAISE EXCEPTION 'You can only see your own conversations.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH user_rooms AS (
    SELECT DISTINCT cr.id AS ur_room_id
    FROM chat_rooms cr
    LEFT JOIN chat_room_members crm ON crm.room_id = cr.id AND crm.user_id = p_user_id
    WHERE cr.community_id = p_community_id
      AND (cr.room_type = 'community' OR crm.user_id IS NOT NULL)
  ),
  room_members_data AS (
    SELECT
      crm.room_id AS rmd_room_id,
      jsonb_agg(
        jsonb_build_object(
          'id', crm.id,
          'user_id', crm.user_id,
          'last_read_at', crm.last_read_at,
          'muted', crm.muted,
          'custom_title', crm.custom_title,
          'custom_emoji', crm.custom_emoji,
          'custom_image_url', crm.custom_image_url,
          'custom_background', crm.custom_background,
          'custom_background_image_url', crm.custom_background_image_url,
          'joined_at', crm.joined_at,
          'user', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'avatar_url', p.avatar_url,
            'email', p.email
          )
        )
      ) AS member_list
    FROM chat_room_members crm
    JOIN profiles p ON p.id = crm.user_id
    JOIN chat_rooms cr ON cr.id = crm.room_id
    WHERE crm.room_id IN (SELECT ur_room_id FROM user_rooms)
      AND cr.room_type::text IN ('dm', 'group_dm')
    GROUP BY crm.room_id
  ),
  last_messages_data AS (
    SELECT DISTINCT ON (rm.room_id)
      rm.room_id AS lmd_room_id,
      jsonb_build_object(
        'id', rm.id,
        'content', rm.content,
        'created_at', rm.created_at,
        'sender_id', rm.sender_id,
        'edited_at', rm.edited_at,
        'sender', jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'avatar_url', p.avatar_url
        )
      ) AS msg_data
    FROM room_messages rm
    JOIN profiles p ON p.id = rm.sender_id
    WHERE rm.room_id IN (SELECT ur_room_id FROM user_rooms)
      AND rm.deleted_at IS NULL
    ORDER BY rm.room_id, rm.created_at DESC
  ),
  user_memberships_data AS (
    SELECT
      crm.room_id AS umd_room_id,
      crm.last_read_at AS umd_last_read_at,
      crm.custom_title AS umd_custom_title,
      crm.custom_emoji AS umd_custom_emoji,
      crm.custom_image_url AS umd_custom_image_url,
      crm.custom_background AS umd_custom_background,
      crm.custom_background_image_url AS umd_custom_background_image_url
    FROM chat_room_members crm
    WHERE crm.user_id = p_user_id
  ),
  unread_counts_data AS (
    SELECT
      rm.room_id AS ucd_room_id,
      COUNT(*) AS unread_total
    FROM room_messages rm
    JOIN user_memberships_data umd ON umd.umd_room_id = rm.room_id
    WHERE rm.room_id IN (SELECT ur_room_id FROM user_rooms)
      AND rm.created_at > umd.umd_last_read_at
      AND rm.sender_id != p_user_id
      AND rm.deleted_at IS NULL
    GROUP BY rm.room_id
  )
  SELECT
    cr.id AS room_id,
    cr.community_id AS room_community_id,
    cr.room_type AS room_type,
    cr.name AS room_name,
    cr.description AS room_description,
    cr.created_by AS room_created_by,
    cr.created_at AS room_created_at,
    umd.umd_custom_title AS custom_title,
    umd.umd_custom_emoji AS custom_emoji,
    umd.umd_custom_image_url AS custom_image_url,
    umd.umd_custom_background AS custom_background,
    umd.umd_custom_background_image_url AS custom_background_image_url,
    COALESCE(rmd.member_list, '[]'::jsonb) AS members,
    lmd.msg_data AS last_message,
    COALESCE(ucd.unread_total, 0) AS unread_count
  FROM chat_rooms cr
  JOIN user_rooms ur ON ur.ur_room_id = cr.id
  LEFT JOIN user_memberships_data umd ON umd.umd_room_id = cr.id
  LEFT JOIN room_members_data rmd ON rmd.rmd_room_id = cr.id
  LEFT JOIN last_messages_data lmd ON lmd.lmd_room_id = cr.id
  LEFT JOIN unread_counts_data ucd ON ucd.ucd_room_id = cr.id
  ORDER BY
    CASE WHEN cr.room_type = 'community' THEN 0 ELSE 1 END,
    COALESCE((lmd.msg_data->>'created_at')::timestamptz, cr.created_at) DESC;
END;
$function$
;


revoke all on function public.get_chat_rooms_with_data(uuid, uuid) from anon;
revoke all on function public.get_or_create_dm_room(uuid, uuid, uuid) from anon;
revoke all on function public.get_or_create_group_dm_room(uuid, uuid[]) from anon;

begin;

-- One meeting ask, one wish.
--
-- OG meetings are conversational: people often discover the thing they need
-- after saying they had no updates. Meeting Helper used to preselect the
-- member's spotlight wish, then staple every jot and every linked to-do onto
-- it. That is how Izzy's Sapphire, encouragement, and social-media asks all
-- became comments on Open Mic & Open Poetry.
--
-- This migration gives each HIVE an explicit capture policy, makes the OG
-- capture atomic, preserves undo/history, and reconciles every mismatched OG
-- meeting jot found in the 2026-08-21 full-data sweep.

-- The history fields also appear in migration 198, which was being prepared in
-- parallel. `if not exists` makes either safe to land first.
alter table public.action_items
  add column if not exists original_description text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.wish_comments
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

create index if not exists wish_comments_visible_wish_idx
  on public.wish_comments (wish_id, created_at)
  where archived_at is null;

comment on column public.wish_comments.archived_at is
  'When an accidental meeting jot was retired without deleting its history.';
comment on column public.wish_comments.archived_by is
  'Who retired the comment; meeting undo and owner reconciliation keep this receipt.';
comment on column public.wish_comments.archive_reason is
  'Stable reason for hiding a preserved comment, such as meeting_helper_undo or empty_meeting_jot_reconciled.';

-- Meeting-note authors can undo their own jot; a HIVE admin can repair a
-- misfiled meeting note without impersonating or deleting its author.
drop policy if exists "Users can update own wish comments" on public.wish_comments;
drop policy if exists "Users and admins can update wish comments" on public.wish_comments;
create policy "Users and admins can update wish comments"
  on public.wish_comments for update
  using (
    public.is_community_member(community_id)
    and (auth.uid() = user_id or public.is_community_admin(community_id))
  )
  with check (
    public.is_community_member(community_id)
    and (auth.uid() = user_id or public.is_community_admin(community_id))
  );

alter table public.communities
  add column if not exists meeting_wish_capture_mode text not null default 'review';

alter table public.communities
  drop constraint if exists communities_meeting_wish_capture_mode_check;
alter table public.communities
  add constraint communities_meeting_wish_capture_mode_check
  check (meeting_wish_capture_mode in ('review', 'automatic'));

update public.communities
set meeting_wish_capture_mode = 'automatic'
where slug = 'default';

comment on column public.communities.meeting_wish_capture_mode is
  'review offers transcript-surfaced wishes back for approval; automatic lets a trusted meeting admin capture each live ask as a real HIVE-scoped wish. OG uses automatic.';

-- One transaction owns the whole live jot. A failure rolls back the wish,
-- every to-do, and the optional comment together, so Home never gets an orphan
-- deep link and a wish never lands without the task that prompted it.
create or replace function public.capture_meeting_jot(
  p_community_id uuid,
  p_about_user_id uuid,
  p_description text,
  p_assignee_ids uuid[],
  p_related_wish_id uuid,
  p_create_wish boolean,
  p_wish_title text,
  p_wish_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_capture_mode text;
  v_about_first text;
  v_wish_id uuid;
  v_created_wish_id uuid;
  v_wish_label text;
  v_comment_id uuid;
  v_action_item_ids uuid[] := '{}'::uuid[];
  v_requested_count integer;
  v_member_count integer;
begin
  if v_actor is null then
    raise exception 'Sign in before capturing a meeting jot.' using errcode = '42501';
  end if;

  if not public.is_community_admin(p_community_id) then
    raise exception 'A HIVE admin captures the meeting record.' using errcode = '42501';
  end if;

  select c.meeting_wish_capture_mode
    into v_capture_mode
  from public.communities c
  where c.id = p_community_id;

  if v_capture_mode is null then
    raise exception 'HIVE not found.' using errcode = '22023';
  end if;

  if p_create_wish and v_capture_mode <> 'automatic' then
    raise exception 'This HIVE reviews surfaced wishes before adding them.' using errcode = '42501';
  end if;

  if nullif(trim(p_description), '') is null
     or regexp_replace(
          regexp_replace(trim(p_description), '^(@[[:alnum:]_.-]+[[:space:],]*)+', '', 'i'),
          '[[:space:]]*[(]re:[^)]*[)][[:space:]]*$',
          '',
          'i'
        ) !~ '[[:alnum:]]' then
    raise exception 'A meeting jot needs a real action.' using errcode = '22023';
  end if;

  select split_part(trim(p.name), ' ', 1)
    into v_about_first
  from public.profiles p
  join public.community_memberships cm
    on cm.user_id = p.id and cm.community_id = p_community_id
  where p.id = p_about_user_id;

  if v_about_first is null then
    raise exception 'The person this jot is about is not in this HIVE.' using errcode = '22023';
  end if;

  select count(distinct requested.id)
    into v_requested_count
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) requested(id);

  select count(distinct cm.user_id)
    into v_member_count
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) requested(id)
  join public.community_memberships cm
    on cm.user_id = requested.id and cm.community_id = p_community_id;

  if v_requested_count = 0 or v_member_count <> v_requested_count then
    raise exception 'Every to-do assignee must be a current member of this HIVE.' using errcode = '22023';
  end if;

  if p_create_wish then
    if p_related_wish_id is not null then
      raise exception 'A new wish cannot also point at an existing wish.' using errcode = '22023';
    end if;
    if nullif(trim(p_wish_description), '') is null then
      raise exception 'A surfaced wish needs its own ask.' using errcode = '22023';
    end if;

    insert into public.wishes (
      user_id,
      community_id,
      title,
      description,
      raw_input,
      status,
      share_scope,
      is_active,
      extracted_from
    ) values (
      p_about_user_id,
      p_community_id,
      nullif(trim(p_wish_title), ''),
      trim(p_wish_description),
      p_description,
      'public',
      'hive',
      true,
      'meeting'
    )
    returning id into v_wish_id;
    v_created_wish_id := v_wish_id;
  elsif p_related_wish_id is not null then
    select w.id
      into v_wish_id
    from public.wishes w
    where w.id = p_related_wish_id
      and w.community_id = p_community_id
      and w.user_id = p_about_user_id
      and w.status = 'public'
      and coalesce(w.is_active, true);

    if v_wish_id is null then
      raise exception 'That wish is not an open wish for this person in this HIVE.' using errcode = '22023';
    end if;
  end if;

  if v_wish_id is not null then
    select v_about_first || '''s ' || coalesce(nullif(trim(w.title), ''), left(trim(w.description), 64))
      into v_wish_label
    from public.wishes w
    where w.id = v_wish_id;
  end if;

  with requested as (
    select distinct id
    from unnest(p_assignee_ids) member(id)
  ), inserted as (
    insert into public.action_items (
      description,
      assigned_to,
      community_id,
      related_user_id,
      related_wish_id
    )
    select
      case
        when requested.id = p_about_user_id then p_description
        when v_wish_id is not null then p_description || ' (re: ' || v_wish_label || ')'
        else p_description || ' (re: ' || v_about_first || ')'
      end,
      requested.id,
      p_community_id,
      p_about_user_id,
      v_wish_id
    from requested
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_action_item_ids
  from inserted;

  -- A note on an EXISTING wish is progress/context and belongs in that
  -- conversation. A brand-new wish already contains the ask, so copying the
  -- identical words into its comments would start it with a duplicate.
  if v_wish_id is not null and v_created_wish_id is null then
    insert into public.wish_comments (
      wish_id,
      user_id,
      community_id,
      content
    ) values (
      v_wish_id,
      v_actor,
      p_community_id,
      '📝 From the ' || to_char(timezone('America/Los_Angeles', now()), 'FMMonth') || ' meeting: ' || p_description
    )
    returning id into v_comment_id;
  end if;

  return jsonb_build_object(
    'wish_id', v_wish_id,
    'created_wish_id', v_created_wish_id,
    'comment_id', v_comment_id,
    'action_item_ids', to_jsonb(v_action_item_ids)
  );
end;
$$;

revoke all on function public.capture_meeting_jot(uuid, uuid, text, uuid[], uuid, boolean, text, text) from public, anon;
grant execute on function public.capture_meeting_jot(uuid, uuid, text, uuid[], uuid, boolean, text, text) to authenticated;

comment on function public.capture_meeting_jot(uuid, uuid, text, uuid[], uuid, boolean, text, text) is
  'Admin-only atomic Meeting Helper capture: optionally creates one automatic-policy wish, links every assignee to it, and comments only when updating an existing wish.';

-- -------------------------------------------------------------------------
-- OG reconciliation: every distinct surfaced ask gets its own conversation.
-- -------------------------------------------------------------------------

insert into public.wishes (
  id, user_id, community_id, title, description, raw_input,
  status, share_scope, is_active, is_spotlight, extracted_from, created_at
)
values
  (
    'd9645ab0-7b7b-4b43-a1b9-cbf669018a46',
    'e7705563-9c0a-48bd-b24b-d464d90077cf',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Sapphire pointers',
    'Izzy would love pointers and guidance from Nat about Sapphire.',
    '@Nat Chat with Izzy about Sapphire pointers',
    'public', 'hive', true, false, 'meeting', '2026-07-25T22:02:27.673479Z'
  ),
  (
    'c77ac926-5091-4849-9cf8-d865979067f0',
    'e7705563-9c0a-48bd-b24b-d464d90077cf',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Creative encouragement',
    'Izzy would love periodic encouragement texts that say, “your shit is dope—send it out,” so she keeps sharing her creative work.',
    '@og Send Izzy periodic encouragement texts ''your shit is dope, send it out''',
    'public', 'hive', true, false, 'meeting', '2026-08-21T02:15:06.758865Z'
  ),
  (
    'b74ae4e9-32ca-4ba5-a5e6-b6e5149efcfe',
    'e7705563-9c0a-48bd-b24b-d464d90077cf',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Social media editor suggestions',
    'Izzy is looking for social media editor recommendations and suggestions.',
    '@og Social media editor suggestions',
    'public', 'hive', true, false, 'meeting', '2026-08-21T02:21:49.809297Z'
  ),
  (
    'a687582a-ed00-4e34-88f2-2cbdc4212c96',
    '7871fbff-dde4-4a20-a104-e5036f199e87',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Accountability and encouragement',
    'Fin would love a weekly accountability text and periodic words of encouragement.',
    '@all once a week accountability text / @og Text Fin words of encouragement periodically',
    'public', 'hive', true, false, 'meeting', '2026-07-24T01:57:36.19627Z'
  ),
  (
    '49638563-3448-4b6d-b8b5-53cf0ace79a2',
    'b2f96ae4-4ac3-4f66-9e97-d956727f80cb',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Encouragement and rest reminders',
    'Nic would appreciate kind check-in messages and occasional reminders to rest and sleep.',
    '@all Maybe send Nic a nice message and remind her to sleep once in a while',
    'public', 'hive', true, false, 'meeting', '2026-07-25T22:04:12.147773Z'
  ),
  (
    'fb8ab140-5764-46d7-b1dd-9a07e1dd41e9',
    'dc703b80-572d-452e-a971-391ea87eb9e7',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Flamingo hanging help',
    'Brit would love Oliver''s help hanging her flamingo.',
    '@Oliver help brit hang her flamingo',
    'public', 'hive', true, false, 'meeting', '2026-08-21T02:29:43.609749Z'
  ),
  (
    '13a17d1a-cc86-40f6-9d62-be6624687395',
    'b2f96ae4-4ac3-4f66-9e97-d956727f80cb',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Microdosing information for Mama Sue',
    'Nic would like to connect with Meghan about microdosing information for Mama Sue.',
    '@nic and @meg connect on microdosing for mama sue',
    'public', 'hive', true, false, 'meeting', '2026-08-21T02:42:42.41059Z'
  ),
  (
    'a2f39d02-cbb7-447f-92f6-f5526c11db8c',
    'b2f96ae4-4ac3-4f66-9e97-d956727f80cb',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Therapy recommendations',
    'Nic is looking for therapist recommendations so she has a supportive place to process and info-dump.',
    '@og Therapy recs so she can info dump and not complain',
    'public', 'hive', true, false, 'meeting', '2026-08-21T02:44:16.889138Z'
  ),
  (
    '82961cd2-8420-465b-8e23-0e78ecdce993',
    'b2f96ae4-4ac3-4f66-9e97-d956727f80cb',
    'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
    'Tiny workout videos',
    'Nic would love very short, 2–5 minute workout-video recommendations.',
    '@og send tiny 2-5min work out videos',
    'public', 'hive', true, false, 'meeting', '2026-08-21T02:44:32.059378Z'
  )
on conflict (id) do nothing;

-- Move each note, preserving its id, author, timestamp, attachments, replies,
-- and reactions. Only the conversation it belongs to changes.
update public.wish_comments
set wish_id = case id
  when '2ce2a508-fb13-4375-a8db-254cdabe1f66' then 'd9645ab0-7b7b-4b43-a1b9-cbf669018a46'::uuid
  when '7169c221-505c-40bc-aeb7-9d4857bb7145' then 'c77ac926-5091-4849-9cf8-d865979067f0'::uuid
  when '8513d80d-4fa2-4bed-ba67-a84195805e00' then 'b74ae4e9-32ca-4ba5-a5e6-b6e5149efcfe'::uuid
  when '931bff61-eb98-479e-8689-7606e6918728' then 'a687582a-ed00-4e34-88f2-2cbdc4212c96'::uuid
  when '7ed63a28-8fd8-446f-bd97-98cb3541bf84' then 'a687582a-ed00-4e34-88f2-2cbdc4212c96'::uuid
  when '4f258699-f7dd-466a-9d99-305bb4ec603f' then '49638563-3448-4b6d-b8b5-53cf0ace79a2'::uuid
  when '1d31fe1a-f1a8-409a-8788-b117790cf88b' then 'ec4b7b8d-072c-47c0-82a9-cc37b6703384'::uuid
  when 'a5c6b11e-6183-46fc-b78d-d1a774131590' then '9e47132f-2255-48c9-8d03-87edfc5a7a25'::uuid
  when 'c8c62785-0a66-48e4-92de-2d7276dd2587' then '005baf75-89f9-4a91-9052-df9612720713'::uuid
  when '01fc71e0-a0c8-44ab-a184-7b081a84aba0' then 'fb8ab140-5764-46d7-b1dd-9a07e1dd41e9'::uuid
  when '12e6011d-1b00-4dee-820b-bde62784ea77' then '13a17d1a-cc86-40f6-9d62-be6624687395'::uuid
  when '0c82fe2a-ff1d-474b-a8b2-83f7bdb87e73' then 'a2f39d02-cbb7-447f-92f6-f5526c11db8c'::uuid
  when 'dcd6d971-c99f-4965-8cec-6b1b84968471' then '82961cd2-8420-465b-8e23-0e78ecdce993'::uuid
  else wish_id
end
where id in (
  '2ce2a508-fb13-4375-a8db-254cdabe1f66',
  '7169c221-505c-40bc-aeb7-9d4857bb7145',
  '8513d80d-4fa2-4bed-ba67-a84195805e00',
  '931bff61-eb98-479e-8689-7606e6918728',
  '7ed63a28-8fd8-446f-bd97-98cb3541bf84',
  '4f258699-f7dd-466a-9d99-305bb4ec603f',
  '1d31fe1a-f1a8-409a-8788-b117790cf88b',
  'a5c6b11e-6183-46fc-b78d-d1a774131590',
  'c8c62785-0a66-48e4-92de-2d7276dd2587',
  '01fc71e0-a0c8-44ab-a184-7b081a84aba0',
  '12e6011d-1b00-4dee-820b-bde62784ea77',
  '0c82fe2a-ff1d-474b-a8b2-83f7bdb87e73',
  'dcd6d971-c99f-4965-8cec-6b1b84968471'
);

-- Wish replies are one level deep. If anybody replied to a moved meeting jot,
-- keep the reply beside its parent rather than stranding it on the old wish.
with moved(parent_id, new_wish_id) as (
  values
    ('2ce2a508-fb13-4375-a8db-254cdabe1f66'::uuid, 'd9645ab0-7b7b-4b43-a1b9-cbf669018a46'::uuid),
    ('7169c221-505c-40bc-aeb7-9d4857bb7145'::uuid, 'c77ac926-5091-4849-9cf8-d865979067f0'::uuid),
    ('8513d80d-4fa2-4bed-ba67-a84195805e00'::uuid, 'b74ae4e9-32ca-4ba5-a5e6-b6e5149efcfe'::uuid),
    ('931bff61-eb98-479e-8689-7606e6918728'::uuid, 'a687582a-ed00-4e34-88f2-2cbdc4212c96'::uuid),
    ('7ed63a28-8fd8-446f-bd97-98cb3541bf84'::uuid, 'a687582a-ed00-4e34-88f2-2cbdc4212c96'::uuid),
    ('4f258699-f7dd-466a-9d99-305bb4ec603f'::uuid, '49638563-3448-4b6d-b8b5-53cf0ace79a2'::uuid),
    ('1d31fe1a-f1a8-409a-8788-b117790cf88b'::uuid, 'ec4b7b8d-072c-47c0-82a9-cc37b6703384'::uuid),
    ('a5c6b11e-6183-46fc-b78d-d1a774131590'::uuid, '9e47132f-2255-48c9-8d03-87edfc5a7a25'::uuid),
    ('c8c62785-0a66-48e4-92de-2d7276dd2587'::uuid, '005baf75-89f9-4a91-9052-df9612720713'::uuid),
    ('01fc71e0-a0c8-44ab-a184-7b081a84aba0'::uuid, 'fb8ab140-5764-46d7-b1dd-9a07e1dd41e9'::uuid),
    ('12e6011d-1b00-4dee-820b-bde62784ea77'::uuid, '13a17d1a-cc86-40f6-9d62-be6624687395'::uuid),
    ('0c82fe2a-ff1d-474b-a8b2-83f7bdb87e73'::uuid, 'a2f39d02-cbb7-447f-92f6-f5526c11db8c'::uuid),
    ('dcd6d971-c99f-4965-8cec-6b1b84968471'::uuid, '82961cd2-8420-465b-8e23-0e78ecdce993'::uuid)
)
update public.wish_comments child
set wish_id = moved.new_wish_id
from moved
where child.parent_comment_id = moved.parent_id;

-- Rewrite every affected fan-out so its deep link and quiet "re:" line name
-- the exact wish. original_description keeps the meeting wording as entered.
with repairs(old_wish_id, description_match, new_wish_id, about_user_id, context_label) as (
  values
    ('9ac7999f-4014-4413-a2bc-b7400d258681'::uuid, '%Sapphire pointers%', 'd9645ab0-7b7b-4b43-a1b9-cbf669018a46'::uuid, 'e7705563-9c0a-48bd-b24b-d464d90077cf'::uuid, 'Izzy''s Sapphire pointers'),
    ('9ac7999f-4014-4413-a2bc-b7400d258681'::uuid, '%periodic encouragement texts%', 'c77ac926-5091-4849-9cf8-d865979067f0'::uuid, 'e7705563-9c0a-48bd-b24b-d464d90077cf'::uuid, 'Izzy''s Creative encouragement'),
    ('9ac7999f-4014-4413-a2bc-b7400d258681'::uuid, '%Social media editor suggestions%', 'b74ae4e9-32ca-4ba5-a5e6-b6e5149efcfe'::uuid, 'e7705563-9c0a-48bd-b24b-d464d90077cf'::uuid, 'Izzy''s Social media editor suggestions'),
    ('18da1932-5dd8-4cea-a6f6-1876fbf02a81'::uuid, '%once a week accountability text%', 'a687582a-ed00-4e34-88f2-2cbdc4212c96'::uuid, '7871fbff-dde4-4a20-a104-e5036f199e87'::uuid, 'Fin''s Accountability and encouragement'),
    ('18da1932-5dd8-4cea-a6f6-1876fbf02a81'::uuid, '%Text Fin words of encouragement periodically%', 'a687582a-ed00-4e34-88f2-2cbdc4212c96'::uuid, '7871fbff-dde4-4a20-a104-e5036f199e87'::uuid, 'Fin''s Accountability and encouragement'),
    ('b9109d1b-f5c1-4257-897d-cb1a442231e0'::uuid, '%send Nic a nice message%', '49638563-3448-4b6d-b8b5-53cf0ace79a2'::uuid, 'b2f96ae4-4ac3-4f66-9e97-d956727f80cb'::uuid, 'Nic''s Encouragement and rest reminders'),
    ('bd6217a3-4e39-4b36-80e5-967d9c2284b8'::uuid, '%connect about cruise%', 'ec4b7b8d-072c-47c0-82a9-cc37b6703384'::uuid, '94d8a600-db23-4855-9b97-b4d0d53c2e86'::uuid, 'Charlee''s Sex Therapy Creative Workshop'),
    ('18da1932-5dd8-4cea-a6f6-1876fbf02a81'::uuid, 'Re: van live:%', '9e47132f-2255-48c9-8d03-87edfc5a7a25'::uuid, '7871fbff-dde4-4a20-a104-e5036f199e87'::uuid, 'Fin''s Van life and travel'),
    ('9f9aa131-5b92-441a-aad7-d6e159568398'::uuid, '%Steve McCauly%', '005baf75-89f9-4a91-9052-df9612720713'::uuid, 'a3fc525e-5e6b-4821-a7d2-cd8a2bd883a7'::uuid, 'Lucas''s Help with medical practices'),
    ('4a036767-35e7-4182-b4c8-52b204784342'::uuid, '%help brit hang her flamingo%', 'fb8ab140-5764-46d7-b1dd-9a07e1dd41e9'::uuid, 'dc703b80-572d-452e-a971-391ea87eb9e7'::uuid, 'Brit''s Flamingo hanging help'),
    ('b9109d1b-f5c1-4257-897d-cb1a442231e0'::uuid, '%connect on microdosing for mama sue%', '13a17d1a-cc86-40f6-9d62-be6624687395'::uuid, 'b2f96ae4-4ac3-4f66-9e97-d956727f80cb'::uuid, 'Nic''s Microdosing information for Mama Sue'),
    ('b9109d1b-f5c1-4257-897d-cb1a442231e0'::uuid, '%Therapy recs so she can info dump%', 'a2f39d02-cbb7-447f-92f6-f5526c11db8c'::uuid, 'b2f96ae4-4ac3-4f66-9e97-d956727f80cb'::uuid, 'Nic''s Therapy recommendations'),
    ('b9109d1b-f5c1-4257-897d-cb1a442231e0'::uuid, '%send tiny 2-5min work out videos%', '82961cd2-8420-465b-8e23-0e78ecdce993'::uuid, 'b2f96ae4-4ac3-4f66-9e97-d956727f80cb'::uuid, 'Nic''s Tiny workout videos')
)
update public.action_items ai
set
  related_wish_id = repair.new_wish_id,
  related_user_id = repair.about_user_id,
  original_description = coalesce(ai.original_description, ai.description),
  description = regexp_replace(ai.description, '[[:space:]]*[(]re:[^)]*[)][[:space:]]*$', '', 'i')
    || case when ai.assigned_to = repair.about_user_id then '' else ' (re: ' || repair.context_label || ')' end,
  edited_at = now(),
  edited_by = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359'
from repairs repair
where ai.community_id = 'e38d99a8-3aa8-4ace-8381-e56bb9991cf9'
  and ai.related_wish_id = repair.old_wish_id
  and ai.description ilike repair.description_match;

-- Two accidental mention-only saves contained no ask at all. Preserve them as
-- archived receipts, but keep them out of Home, the wish conversation, and the
-- sealed meeting summary.
update public.action_items
set
  archived_at = coalesce(archived_at, now()),
  archived_by = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359',
  archive_reason = 'empty_meeting_jot_reconciled',
  original_description = coalesce(original_description, description),
  edited_at = coalesce(edited_at, now()),
  edited_by = coalesce(edited_by, 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359')
where community_id = 'e38d99a8-3aa8-4ace-8381-e56bb9991cf9'
  and (
    (related_wish_id = '005baf75-89f9-4a91-9052-df9612720713' and description = '@lucas')
    or
    (related_wish_id = 'b9109d1b-f5c1-4257-897d-cb1a442231e0' and description in ('@og', '@og (re: Nic''s HummDinger)'))
  );

update public.wish_comments
set
  archived_at = coalesce(archived_at, now()),
  archived_by = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359',
  archive_reason = 'empty_meeting_jot_reconciled'
where id in (
  '79da82f2-3de9-49ec-8f0d-eb79e09366bb',
  '70de70bd-9f68-44aa-b590-2664ef828b94'
);

-- Nat had already completed her part of the social-media ask outside HIVE.
-- Put that real-world progress on the right wish and close only her assignment;
-- everyone else's recommendation task stays open.
insert into public.wish_comments (
  id, wish_id, user_id, community_id, content, created_at
) values (
  'e758d237-66ef-4d58-8ebe-1c0c38599fb1',
  'b74ae4e9-32ca-4ba5-a5e6-b6e5149efcfe',
  'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359',
  'e38d99a8-3aa8-4ace-8381-e56bb9991cf9',
  '✅ Nat texted Izzy Em''s contact information for social-media help.',
  now()
)
on conflict (id) do nothing;

update public.action_items
set
  completed = true,
  completed_at = coalesce(completed_at, now())
where community_id = 'e38d99a8-3aa8-4ace-8381-e56bb9991cf9'
  and related_wish_id = 'b74ae4e9-32ca-4ba5-a5e6-b6e5149efcfe'
  and assigned_to = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359';

commit;

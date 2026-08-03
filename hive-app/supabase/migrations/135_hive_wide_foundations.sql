-- HIVE-Wide: the three things everything else sits on
--
-- Nat's design, settled 2026-08-03 across a long morning. The whole of it:
--
--   Green means everyone. Your HIVE's colour means home.
--   Two kinds of board: shared ones, and your HIVE's own.
--   Nothing is ever copied. One thing, in one place, with a reach.
--   Everything defaults to home; whoever made it can open it up, one at a time.
--   You choose whether YOU come with it.
--
-- The last line is the new idea and it's hers. Reach was a property of a HIVE in
-- every draft before this; she put it on the person, which is the only place it
-- works — Brit and Nic can want different things inside the same HIVE, and no
-- setting on OG HIVE can express that.

-- ---------------------------------------------------------------------------
-- 1. Your profile has its own reach
-- ---------------------------------------------------------------------------
--
-- Post to HIVE Approved with your profile open and your face rides along, so
-- someone in another HIVE can tap through and see who vouched for the masseuse —
-- which is most of what a recommendation is worth. Keep it closed and the
-- recommendation still counts; you just don't come with it. A little bee stands
-- in for you, because a greyed blank reads as broken or blocked, and this is
-- neither: it's somebody who keeps to their own HIVE.

alter table public.profiles
  add column if not exists profile_scope text not null default 'hive';

alter table public.profiles
  drop constraint if exists profiles_profile_scope_check;
alter table public.profiles
  add constraint profiles_profile_scope_check
  check (profile_scope in ('hive', 'all_hives'));

comment on column public.profiles.profile_scope is
  'How far YOU travel, as opposed to what you write. hive: only people in a HIVE you share appear to know you. all_hives: anyone in any HIVE can open your card. Defaults to hive, like everything else.';

-- Today a profile is visible to people who share a HIVE with you (migration 004,
-- and it is correct). This only ever WIDENS that, and only if you asked it to —
-- so the default changes nothing for anybody currently in the app.
drop policy if exists "Users can view own profile and community members" on public.profiles;

create policy "Users can view own profile and community members"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from public.community_memberships cm
       where cm.user_id = profiles.id
         and cm.community_id in (
           select community_id from public.community_memberships where user_id = auth.uid()
         )
    )
    or (profiles.profile_scope = 'all_hives' and public.is_any_community_member())
  );

-- Your reach is yours. An admin has no business deciding that somebody else's
-- face travels — same rule as migration 134 gave a reply.
create or replace function public.guard_profile_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_scope is distinct from old.profile_scope
     and auth.uid() is not null
     and new.id <> auth.uid() then
    raise exception 'Only you decide how far your profile travels.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_scope on public.profiles;
create trigger guard_profile_scope
  before update on public.profiles
  for each row execute function public.guard_profile_scope();

-- ---------------------------------------------------------------------------
-- 2. Two kinds of board
-- ---------------------------------------------------------------------------
--
-- There is one HIVE Approved, not three — "we're growing a community of people,
-- places and things we trust", and a list split three ways grows a third as
-- fast. Same for admin announcements.
--
-- Physically each HIVE keeps its own copy of the board, and that is deliberate:
-- merging them would mean moving other people's posts between HIVEs, and a new
-- HIVE would need somebody to remember to wire it up. Instead the boards are
-- MARKED as shared, and the app shows the marked ones together. Three boards,
-- one noticeboard, no data moved and nothing to remember later.

alter table public.board_categories
  add column if not exists reach text not null default 'hive';

alter table public.board_categories
  drop constraint if exists board_categories_reach_check;
alter table public.board_categories
  add constraint board_categories_reach_check
  check (reach in ('hive', 'all_hives'));

comment on column public.board_categories.reach is
  'hive: this HIVE''s own board, one per HIVE. all_hives: a shared noticeboard — every HIVE has a copy and the app reads them as one. New boards are a HIVE''s own until somebody says otherwise.';

update public.board_categories
   set reach = 'all_hives'
 where name in ('HIVE Approved', 'Announcements');

-- A post written on a shared board is meant for everyone, so it says so without
-- anybody having to find a toggle. Only when the writer left it at the default —
-- if they deliberately chose something, that choice stands.
create or replace function public.default_shared_board_reach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     and coalesce(new.visibility, 'members') = 'members'
     and exists (
       select 1 from public.board_categories bc
        where bc.id = new.category_id and bc.reach = 'all_hives'
     ) then
    new.visibility := 'all_hives';
  end if;
  return new;
end;
$$;

-- Runs before guard_post_visibility, alphabetically, which is what we want:
-- set the value first, then let the guard judge it.
drop trigger if exists default_shared_board_reach on public.board_posts;
create trigger default_shared_board_reach
  before insert on public.board_posts
  for each row execute function public.default_shared_board_reach();

-- NOTE, and it needs saying out loud: the posts ALREADY on HIVE Approved and
-- Announcements are untouched. They were written when the board was OG HIVE's
-- alone, and widening them now would be publishing other people's words on their
-- behalf — the thing we spent this morning making impossible. They stay put
-- until their authors open them, or until Nat asks the HIVE at a meeting.

-- ---------------------------------------------------------------------------
-- 3. One focus a month
-- ---------------------------------------------------------------------------
--
-- One row per focus. A row with no community_id is THE focus — chosen in OG HIVE
-- and seen by everyone. A row naming a HIVE is that HIVE's own variant and
-- quietly replaces it for them. A HIVE with no row of its own simply follows the
-- shared one, so nobody opts out of anything and a fourth HIVE needs no code.
--
-- The standing invitation — "always on the table: log an act of kindness you did
-- for yourself, someone you love, a stranger or the planet" — is deliberately
-- NOT in this table. It is the same in August as it is next March, so it lives
-- in code (lib/hiveFocus.ts) and cannot be quietly reworded month by month until
-- it stops sounding like an open door.

create table if not exists public.monthly_focus (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  community_id uuid references public.communities(id) on delete cascade,
  title text not null,
  body text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_focus_month_check check (month ~ '^\d{4}-\d{2}$')
);

comment on table public.monthly_focus is
  'The month''s HIVE Focus. community_id null means everyone; a named HIVE overrides it for that HIVE only.';

-- One shared focus per month, and at most one variant per HIVE per month.
create unique index if not exists monthly_focus_shared_unique
  on public.monthly_focus (month) where community_id is null;
create unique index if not exists monthly_focus_hive_unique
  on public.monthly_focus (month, community_id) where community_id is not null;

alter table public.monthly_focus enable row level security;

-- Everybody in any HIVE reads it. That is the point of it.
create policy "The focus is for everyone"
  on public.monthly_focus for select
  using (public.is_any_community_member());

-- Nat and Lucas set it. It speaks for all the HIVEs at once, so it is not an
-- admin's to write any more than the newsletter is.
create policy "Owners set the focus"
  on public.monthly_focus for all
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

grant select on public.monthly_focus to authenticated;
grant insert, update, delete on public.monthly_focus to authenticated;

-- August, in Nat's own words.
insert into public.monthly_focus (month, community_id, title, body, created_by)
select
  '2026-08',
  null,
  'Donate to a Shelter of Your Choice',
  'Drop a donation at Passion Vine any time, bring it with you to the OG HIVE '
  || 'meeting, or if you''re out of state you can do a local one yourself.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
on conflict do nothing;

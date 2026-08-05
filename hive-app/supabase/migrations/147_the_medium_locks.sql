-- The mediums from the 2026-08-04 audit.
--
-- The four criticals were closed the same day (migrations 144 and 146). These
-- are the ones that were written down and left, and they all have the same
-- shape as each other: a guard that was correct when there was ONE HIVE and
-- stopped being correct the day there were three.
--
-- Nothing in here is theoretical. Every rule below was checked against the live
-- rows before it was written, because the last time somebody wrote an
-- obviously-right constraint it would have emptied the public newsletter
-- archive.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The newsletter list and the waitlist belonged to whoever ran ANY HIVE.
--
-- Both policies read, in full:
--
--   exists (select 1 from community_memberships cm
--           where cm.user_id = auth.uid() and cm.role = 'admin')
--
-- Look at what is missing: there is no `cm.community_id = anything`. It asks
-- "are you an admin somewhere", not "are you an admin here" — and there is no
-- "here" to ask about, because neither table has a community_id. They are
-- app-wide lists. So the moment Tech HIVE or Production HIVE gets its own
-- admin, that person can read and edit every address on the whole app's
-- newsletter list and everybody who ever asked to be let in.
--
-- These lists are not community data. The newsletter goes out from the-hive.app
-- past every HIVE, and the waitlist is people asking Nat and Lucas for a way in.
-- They belong to the owners, and only to them.
--
-- Today that is a change of exactly one person's view: Nic Munson is an admin
-- of OG HIVE and not an owner, and the Newsletter box on /admin is drawn behind
-- `isAdmin`, so it will go empty for him. Both tables currently hold zero rows,
-- so nothing disappears off anybody's screen this week — but the box will need
-- an owner check on it eventually, and that is a UI job, not this one.
drop policy if exists "Admins can read subscribers" on public.newsletter_subscribers;
create policy "Owners can read subscribers"
  on public.newsletter_subscribers for select
  using (public.is_hive_owner());

drop policy if exists "Admins can remove subscribers" on public.newsletter_subscribers;
create policy "Owners can remove subscribers"
  on public.newsletter_subscribers for update
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

drop policy if exists "Community admins can view waitlist" on public.waitlist;
create policy "Owners can view the waitlist"
  on public.waitlist for select
  using (public.is_hive_owner());

-- Signing up for the waitlist and then being told nothing happened.
--
-- `app/join.tsx` looks your own address up on the waitlist so it can say "you're
-- already on the list" instead of offering to add you twice. Under the old
-- policy that read only ever returned rows for an admin, so for the people the
-- screen was written for it silently returned nothing and offered to add them
-- again. Narrowing the admin rule to owners does not make that worse, but while
-- we are here it can be made to actually work: you may see your own row.
create policy "You can see your own place in the queue"
  on public.waitlist for select
  using (lower(email) = lower(auth.email()));

-- And the matching delete, which has never worked once.
--
-- It reads `email = (select users.email from auth.users where users.id =
-- auth.uid())`. A policy expression runs with the privileges of whoever is
-- asking, and `authenticated` has no rights on `auth.users` at all — not the
-- table, not one column. So that subquery does not return nothing, it raises
-- "permission denied for table users", and taking yourself off the waitlist
-- fails with a database error rather than a refusal. It is the only policy in
-- the whole database that reaches into auth.users, which is why nothing else
-- has this.
--
-- auth.email() is the supported way to ask, and it never touches the table — it
-- reads the address straight out of the token. lower() on both sides because
-- join.tsx stores what you typed, lowercased, and a token carries it as
-- registered.
drop policy if exists "Users can remove self from waitlist" on public.waitlist;
create policy "Users can remove self from waitlist"
  on public.waitlist for delete
  using (lower(email) = lower(auth.email()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A row could walk itself out of its own HIVE.
--
-- Twenty-two UPDATE policies had a USING clause and no WITH CHECK. Postgres is
-- kinder about that than it looks — with no WITH CHECK it reuses USING to test
-- the new row — but reusing USING only tests what USING happens to mention, and
-- most of these mention the author and not the HIVE:
--
--   board_posts, "Authors can update own posts":  using (auth.uid() = author_id)
--
-- The row after the edit still has to have you as its author. It does not have
-- to still be in the same HIVE, or in a HIVE you have ever been in. So any
-- member could take one of their own posts, set community_id to OG HIVE's id,
-- and have it appear on OG HIVE's board written by somebody OG HIVE has never
-- met. Same for their own replies, their own chat messages, their own skills.
--
-- Two things are needed, and neither is enough alone:
--
--   a) a WITH CHECK that names the HIVE, so a row cannot land in a HIVE you are
--      not in; and
--   b) a trigger, because WITH CHECK cannot see OLD. A policy can say "the new
--      community_id must be one of yours"; only a trigger can say "the new
--      community_id must be the OLD one". For anybody in two HIVEs — which is
--      Nat, in all three — (a) on its own still lets a post walk.
--
-- Checked first: across every table below there are zero rows whose author is
-- not a member of the row's community, so nobody is losing the ability to edit
-- something they already own. (`skills` has 13 such rows and `conversations`
-- one, all in OG HIVE — but those two policies ALREADY carry
-- is_community_member in USING, so those rows are un-editable today and this
-- changes nothing for them.)

-- The trigger. One function, attached to every table that carries a HIVE id.
create or replace function public.pin_the_hive_a_row_belongs_to()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text := coalesce(tg_argv[0], 'community_id');
  was uuid;
  now_ uuid;
begin
  was := nullif(to_jsonb(old) ->> col, '')::uuid;
  now_ := nullif(to_jsonb(new) ->> col, '')::uuid;

  if was is distinct from now_ then
    -- The backend genuinely may need to move things — merging a HIVE, fixing
    -- an import. It runs with the service role, which has no auth.uid() and
    -- already bypasses every policy on this table, so refusing it here would
    -- buy nothing and break the repair tools.
    if auth.uid() is not null then
      raise exception 'A % cannot move between HIVEs.', tg_table_name;
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'action_items', 'board_posts', 'board_replies', 'community_invites',
    'community_memberships', 'conversation_projects', 'conversations',
    'daily_question_answers', 'events', 'honey_pot', 'meetings',
    'monthly_highlights', 'queen_bees', 'room_messages', 'skills',
    'survey_responses', 'user_insights'
  ] loop
    execute format('drop trigger if exists pin_the_hive on public.%I', t);
    execute format(
      'create trigger pin_the_hive before update on public.%I
         for each row execute function public.pin_the_hive_a_row_belongs_to()',
      t
    );
  end loop;
end;
$$;

-- `communities` is deliberately not in that list: its HIVE id IS its primary
-- key, every other table points at it, and Postgres will not let you move it
-- out from under those foreign keys anyway.

-- The policies. Each one gets the WITH CHECK it always meant.

-- Already names the HIVE and the person in USING; it just never said so twice.
drop policy if exists "Assigned user can update action items" on public.action_items;
create policy "Assigned user can update action items"
  on public.action_items for update
  using (
    public.is_community_member(community_id)
    and (auth.uid() = assigned_to or public.is_community_admin(community_id))
  )
  with check (
    public.is_community_member(community_id)
    and (auth.uid() = assigned_to or public.is_community_admin(community_id))
  );

-- This one spelled out `role = 'admin'` inline instead of calling
-- is_community_admin, which means it was the one admin policy in the app that
-- did NOT let an owner through. Nat and Lucas are both admins of the HIVEs they
-- are in so nobody noticed, but the two should agree, and the helper is the one
-- that is right (migration 128).
drop policy if exists "Admins can update any post" on public.board_posts;
create policy "Admins can update any post"
  on public.board_posts for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

drop policy if exists "Authors can update own posts" on public.board_posts;
create policy "Authors can update own posts"
  on public.board_posts for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id and public.is_community_member(community_id));

drop policy if exists "Authors can update own replies" on public.board_replies;
create policy "Authors can update own replies"
  on public.board_replies for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id and public.is_community_member(community_id));

drop policy if exists "Community admins can update" on public.communities;
create policy "Community admins can update"
  on public.communities for update
  using (public.is_community_admin(id))
  with check (public.is_community_admin(id));

drop policy if exists "Admins can update invites" on public.community_invites;
create policy "Admins can update invites"
  on public.community_invites for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

drop policy if exists "Admins can update members" on public.community_memberships;
create policy "Admins can update members"
  on public.community_memberships for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

drop policy if exists "Users can update own conversation projects" on public.conversation_projects;
create policy "Users can update own conversation projects"
  on public.conversation_projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_community_member(community_id));

drop policy if exists "Users can update own conversations" on public.conversations;
create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id and public.is_community_member(community_id))
  with check (auth.uid() = user_id and public.is_community_member(community_id));

drop policy if exists "Users can update own answers" on public.daily_question_answers;
create policy "Users can update own answers"
  on public.daily_question_answers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_community_member(community_id));

drop policy if exists "Members can update own events or admins can update all" on public.events;
create policy "Members can update own events or admins can update all"
  on public.events for update
  using (created_by = auth.uid() or public.is_community_admin(community_id))
  with check (
    (created_by = auth.uid() and public.is_community_member(community_id))
    or public.is_community_admin(community_id)
  );

drop policy if exists "Treasurer can update honey pot" on public.honey_pot;
create policy "Treasurer can update honey pot"
  on public.honey_pot for update
  using (public.is_community_treasurer(community_id))
  with check (public.is_community_treasurer(community_id));

drop policy if exists "Members can update meetings" on public.meetings;
create policy "Members can update meetings"
  on public.meetings for update
  using (public.is_community_member(community_id))
  with check (public.is_community_member(community_id));

drop policy if exists "Community members can update highlights" on public.monthly_highlights;
create policy "Community members can update highlights"
  on public.monthly_highlights for update
  using (public.is_community_member(community_id))
  with check (public.is_community_member(community_id));

-- profiles has no community_id — it is the one row in the app that belongs to a
-- person rather than to a HIVE. WITH CHECK here is only saying that an update
-- cannot hand your row to somebody else. What may be CHANGED in it is already
-- guarded by guard_profile_privileges (144) and guard_profile_scope.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Admins can update queen bees" on public.queen_bees;
create policy "Admins can update queen bees"
  on public.queen_bees for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

drop policy if exists "Senders can edit own messages" on public.room_messages;
create policy "Senders can edit own messages"
  on public.room_messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id and public.is_community_member(community_id));

drop policy if exists "Users can update own skills" on public.skills;
create policy "Users can update own skills"
  on public.skills for update
  using (auth.uid() = user_id and public.is_community_member(community_id))
  with check (auth.uid() = user_id and public.is_community_member(community_id));

drop policy if exists "Users can update own responses" on public.survey_responses;
create policy "Users can update own responses"
  on public.survey_responses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_community_member(community_id));

drop policy if exists "Users can update own insights" on public.user_insights;
create policy "Users can update own insights"
  on public.user_insights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_community_member(community_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Your phone number and your push token are not HIVE business.
--
-- ⚠️ THIS SECTION DOES NOT RUN BY DEFAULT, ON PURPOSE. It is paired with a
--    change in the app code that is not written yet, and if it lands without
--    that change, `select('*')` on profiles starts returning an error — which
--    means the members list stops loading AND SO DOES SIGN-IN, for everybody.
--    An audit finding staying open one more day is a smaller thing than that.
--
--    When the three call sites named below have been given explicit column
--    lists, run this and it is done:
--
--      set hive.profiles_columns_ready = 'yes';
--      revoke select (push_token, phone) on public.profiles from authenticated;
--      revoke select (push_token, phone) on public.profiles from anon;
--
--    (or re-run this migration with that setting in place). Everything above
--    this line applies normally and is safe on its own.
--
-- What is wrong: `profiles` is one table with one SELECT policy, and that policy
-- correctly lets you see anyone you share a HIVE with. Row-level security is
-- row-level — it has no opinion about COLUMNS. So "you can see your co-members"
-- has always also meant "you can see your co-members' phone numbers and their
-- Expo push tokens", and with three HIVEs it is a bigger room than it was.
--
-- The phone number is the obvious one. The push token is the quieter one: it is
-- the address a notification is delivered to, and holding somebody else's is
-- holding the ability to put a notification on their lock screen from outside
-- the app entirely.
--
-- Column privileges are the only tool Postgres has for this, and they are
-- blunt: `select *` asks for every column, so once a column is revoked, `select
-- *` fails outright rather than quietly returning less.
--
-- CHECKED BEFORE WRITING THIS — who actually reads these two columns:
--
--   push_token   read ONLY by edge functions (meeting-reminder, notify-dm, the
--                three notify-*-mention functions, notify-board-reply,
--                check-in-reminder). Every one of them uses the service role,
--                which is not subject to column privileges. Push is not
--                affected by this change. The app itself only ever WRITES it,
--                in lib/hooks/useNotifications.ts.
--   phone        read in app/(app)/profile.tsx, and only ever off your own
--                profile. Nothing in the app shows another member's phone.
--
-- So nothing needs another person's copy of either. The only thing standing in
-- the way is three places that ask for the whole row with `select('*')`:
--
--   app/_layout.tsx:169       your own profile      → needs an explicit column
--                                                     list that INCLUDES phone
--                                                     and push_token
--   app/join.tsx:224          your own profile      → same
--   app/(app)/members.tsx:2195 everyone else's      → explicit list, and it
--                                                     must NOT ask for either
--
-- `select('*')` will keep working for your own row only if the request never
-- names another person's — which is not how PostgREST works, so all three have
-- to be spelled out.
do $$
begin
  if coalesce(current_setting('hive.profiles_columns_ready', true), '') = 'yes' then
    execute 'revoke select (push_token, phone) on public.profiles from authenticated';
    execute 'revoke select (push_token, phone) on public.profiles from anon';
    raise notice 'profiles.push_token and profiles.phone are now yours alone.';
  else
    raise warning 'SKIPPED: profiles.push_token and profiles.phone are still readable by co-members. See the header of section 3 in migration 147 for the two lines that close it.';
  end if;
end;
$$;

-- Writing them stays exactly as it was either way: you can still save your own
-- phone number, and the app can still register its push token. Revoking SELECT
-- on a column does not touch UPDATE on it, and the policy above already limits
-- that to your own row.

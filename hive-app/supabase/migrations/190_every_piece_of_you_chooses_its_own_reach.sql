-- Every piece of you chooses its own reach.
--
-- Nat, 2026-08-19, after setting her profile visible HIVE-Wide and going
-- looking for it: *"I'm in Production HIVE profile. I did make it visible HIVE
-- wide... and then I go into members and I'm only HIVE-wide there, it doesn't
-- show. It shows About You and the honeycombs and it has my bio and my three
-- and my cue, but it doesn't show my skills garden or my HD wishes, even though
-- I toggled it on to HIVE wide."*
--
-- And, the same day, about one wish: *"I have a wish here that says Nellie a
-- personal shopper feedback and it's HIVE wide. So that means that that part of
-- my profile should show up in all three HIVEs. And it only showed up on the
-- HIVE-wide and OG HIVE. It skipped Production HIVE."*
--
-- Her rule, in her words: *"each chunk of this, you can toggle if you want it
-- to be just this HIVE or HIVE wide, and if it's HIVE wide, then it shows up in
-- every HIVE you're in and the HIVE-wide umbrella... each part of your profile
-- should be toggleable. So like each individual wish, you decide who can see
-- it."*
--
-- And the shape of the choice, clarified later the same day: *"It shouldn't be
-- to which HIVEs; you shouldn't have to choose between the three HIVEs. It's
-- either just this HIVE or HIVE-wide on each one of them, because you might
-- want different skills in each one."* **Two rungs on a piece of a person, never
-- three.** Public is a rung the ladder in `lib/hiveWide.ts` still has, and it
-- belongs to things a HIVE publishes — an event, a newsletter, a wish somebody
-- deliberately sends outside. A person's bio does not get a megaphone from a
-- toggle this small.
--
-- Three things this migration does:
--
--   1. `profiles.piece_reach` — one map, one entry per piece of a card.
--   2. `skills.reach` — a Skills Garden that can travel, and a read policy that
--      lets it, mirroring exactly what `wishes` has done since migration 124.
--   3. A comment on `wishes.share_scope`, which has carried the whole
--      "how far does this wish go" decision since migration 124 with nothing
--      written on it at all.
--
-- Vocabulary: `reach`, the word `board_categories.reach` and `chat_rooms.reach`
-- already use, and the same two values `lib/scopeLook.ts` normalises everything
-- else to. No third word for one idea.
--
-- Nothing here widens anybody. Every new column defaults to the value that
-- travels least, and an empty `piece_reach` means "exactly as this profile
-- behaved yesterday" — see the column comment.

-- ---------------------------------------------------------------------------
-- 1. Each piece of a person's card carries its own reach.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists piece_reach jsonb not null default '{}'::jsonb;

-- An object, always. A stray array or string here would make every read on
-- every member card guess, and this is the column that decides who sees a bio.
alter table public.profiles
  drop constraint if exists profiles_piece_reach_is_object;
alter table public.profiles
  add constraint profiles_piece_reach_is_object
  check (jsonb_typeof(piece_reach) = 'object');

comment on column public.profiles.piece_reach is
  'How far each single piece of this person''s card travels, one key per piece: '
  '{"bio": "all_hives", "fun_fact:0": "hive"}. Two values only — "hive" (the '
  'people you joined with) and "all_hives" (everyone in every HIVE, at the '
  'HIVE-Wide umbrella AND inside every HIVE this person belongs to). Anything '
  'else reads as "hive", the safe end of the ladder, the same way '
  'lib/scopeLook.ts normaliseScope() folds every other scope column. '
  'KEYS: bio, known_for, miq (the 3MIQ trio, one answer set), profile_title '
  '(the honeycomb Title cell, which falls back to occupation), hometown, '
  'current_project, currently_reading, favorite_book, favorite_food, '
  'favorite_hobby, and fun_fact:<position> for each fun fact. '
  'A MISSING KEY MEANS "follow profiles.profile_scope", which is exactly what '
  'every one of these fields did before this column existed: your whole card '
  'travelled or it did not. So an empty map — what every existing row got — '
  'changes nobody''s visibility in either direction. That is the point: nobody''s '
  'private bio may become HIVE-Wide because a column appeared. '
  'NOT IN HERE: birthday, which has had its own two columns since migration 164 '
  '(birthday_visibility / birthday_invited_scope) and reaches the public; the '
  'Skills Garden, which is skills.reach because a garden is per-HIVE rows; and '
  'wishes, which is wishes.share_scope for the same reason. '
  'The HIVE ceiling (communities.max_share_scope) does not apply here. A profile '
  'is not IN a HIVE — it belongs to a person — which is why profile_scope has '
  'never asked a ceiling either. '
  'WHAT THIS DOES NOT DO: a per-HIVE VALUE. Nat also wants a different "ask me '
  'about" in each HIVE ("maybe I want to tailor that to each individual HIVE"). '
  'There is one bio on one row, so "this HIVE only" here means "only people who '
  'share a HIVE with me, and never at HIVE-Wide". Different words per HIVE is a '
  'later phase and wants its own table (added 2026-08-19).';

-- ---------------------------------------------------------------------------
-- 2. A Skills Garden that can travel.
-- ---------------------------------------------------------------------------

-- Skills are per-HIVE rows (user_id + community_id), and until now that was the
-- whole story: a garden planted in OG HIVE was invisible in Production HIVE
-- with nothing on screen saying why. Charlee read that as the app losing her
-- work — *"it never saves my profile"* — and she was right about what she saw.
alter table public.skills
  add column if not exists reach text not null default 'hive';

alter table public.skills
  drop constraint if exists skills_reach_check;
alter table public.skills
  add constraint skills_reach_check check (reach in ('hive', 'all_hives'));

comment on column public.skills.reach is
  'How far this skill flower travels. "hive" (default): it grows in the HIVE it '
  'was planted in and nowhere else. "all_hives": it shows at the HIVE-Wide '
  'umbrella and inside every HIVE its owner belongs to. Two values only — a '
  'garden is a piece of a person, and Nat''s rule for those is this HIVE or '
  'HIVE-Wide, never a menu of HIVEs. Defaults to "hive" so every one of the 276 '
  'flowers already planted stays exactly where its owner planted it. The whole '
  'garden is toggled at once from Profile; the value lives per row because '
  'that is where the HIVE it belongs to lives (added 2026-08-19).';

-- The read policy, mirroring `wishes` exactly.
--
-- The live policy was `is_community_member(community_id)` and nothing else, so
-- a HIVE-Wide flower would have been marked HIVE-Wide and still unreadable by
-- anybody outside its HIVE — the toggle would have been a lie the database told
-- back. This is the same three-part test "Wishes viewable by scope" has used
-- since migration 124: your own always, your HIVE-mates', and anything marked
-- to travel out of a HIVE whose ceiling lets it.
--
-- `community_shares_beyond_hive(community_id)` is load-bearing and it is the
-- OWNING HIVE's ceiling, not the reader's. Production HIVE's max_share_scope is
-- 'hive' today, so a flower planted in Production stays in Production whatever
-- its owner picks — which is the rule in CLAUDE.md, and which Profile now says
-- out loud instead of quietly ignoring the toggle.
drop policy if exists "Skills viewable by community members" on public.skills;
drop policy if exists "Skills viewable by scope" on public.skills;
create policy "Skills viewable by scope" on public.skills
  for select using (
    auth.uid() = user_id
    or is_community_member(community_id)
    or (
      reach = 'all_hives'
      and community_shares_beyond_hive(community_id)
      and is_any_community_member()
    )
  );

-- The member card asks "which of this person's flowers travel?" once per
-- directory load, for everybody on it at once. Tiny table today; this keeps the
-- question cheap as gardens grow.
create index if not exists skills_travelling_idx
  on public.skills (user_id)
  where reach = 'all_hives';

-- ---------------------------------------------------------------------------
-- 3. The column that already did this job, finally saying so.
-- ---------------------------------------------------------------------------

comment on column public.wishes.share_scope is
  'How far this wish travels: "hive" (the people you joined with), "all_hives" '
  '(everyone in every HIVE — the HIVE-Wide umbrella AND inside every HIVE its '
  'owner belongs to), or "public" (the newsletter and the-hive.app). The rungs '
  'of lib/hiveWide.ts SCOPE_LADDER, read through lib/scopeLook.ts. The row keeps '
  'its community_id whatever this says: a wish always belongs to the HIVE it was '
  'written in, and this only decides who else may read it. "Wishes viewable by '
  'scope" enforces it, capped by the owning HIVE''s communities.max_share_scope. '
  'Added migration 124; described here 2026-08-19, when a wish marked all_hives '
  'in OG HIVE turned out to be invisible in Production HIVE because the member '
  'card asked for one HIVE''s rows rather than for everything that reaches this '
  'far.';

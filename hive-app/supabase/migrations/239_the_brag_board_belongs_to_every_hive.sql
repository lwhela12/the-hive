-- The Brag Board: born in Tech HIVE, open to every HIVE.
--
-- Nat, 2026-09-06: "I want to have some way of showing off things that we've
-- made" -- finished work, work in progress, feedback requests, beta calls and
-- things somebody is simply proud of. Tech already had the right bones under
-- the name "Things We Made": one pinned explainer and one thread per project.
-- This keeps that one board and opens its reach instead of copying it.
--
-- The second half closes a real gap in the HIVE-Wide board contract. The read
-- policy on posts already follows visibility, but the original create/reply/
-- reaction policies still require membership in the HIVE that owns the row.
-- A member outside Tech could therefore see the shared board and then fail at
-- every invitation to participate. Shared means any signed-in HIVE member can
-- take part, subject to the owning HIVE's sharing ceiling.

-- ---------------------------------------------------------------------------
-- 1. The board and its existing project threads.
-- ---------------------------------------------------------------------------

do $$
declare
  brag_board_id uuid;
begin
  select bc.id into brag_board_id
  from public.board_categories bc
  join public.communities c on c.id = bc.community_id
  where c.slug = 'tech'
    and bc.name in ('Things We Made', 'Brag Board')
  order by bc.created_at
  limit 1;

  if brag_board_id is null then
    raise exception 'Tech HIVE Things We Made board was not found.';
  end if;

  update public.board_categories
  set
    name = 'Brag Board',
    description = 'Show what you made or what you are making. One thread per project -- share the link, mark its stage, and ask for feedback, testers, users, or cheering.',
    icon = '✨',
    reach = 'all_hives'
  where id = brag_board_id;

  -- Migration 232 normally carries these when board reach changes. Name the
  -- result here too so a database that missed that trigger still tells the
  -- truth immediately; public posts, if the board ever has one, stay public.
  update public.board_posts
  set visibility = 'all_hives'
  where category_id = brag_board_id
    and visibility = 'members';

  update public.board_posts
  set
    title = 'Start here: brag on yourself',
    content = '**Brag on yourself.** One project per thread.\n\n'
      || '**Stage:** 🛠 Building · 🧪 Ready for testers · ✨ Live · 🌙 Paused\n\n'
      || '**Who:** Who made it, with every real collaborator named.\n\n'
      || '**Where:** Link it if people can open it.\n\n'
      || '**What it is:** One plain-English sentence.\n\n'
      || '**What helps:** Ask for feedback, testers, users -- or just a little cheering.\n\n'
      || 'Come back and change the stage when it moves.',
    edited_at = now()
  where category_id = brag_board_id
    and is_pinned = true
    and title in ('Start here: what this board is', 'Start here: brag on yourself');

  -- Put the stage first so it survives the board-card preview. These are the
  -- projects Nat already seeded; future members use the pinned template.
  update public.board_posts p
  set
    content = case p.title
      when 'Nellie, your personal shopper' then '**Stage:** 🧪 Ready for beta testers\n\n' || p.content
      when 'Content Creature' then '**Stage:** 🛠 Building -- the public site is ready; the app is still in production\n\n'
        || replace(
          p.content,
          '- **Where it is at:** live. Free to sign up and look around, $5 a month to unlock it.',
          '- **Where it is at:** the public site is ready; the app is still in production.'
        )
      when 'Yours CRM' then '**Stage:** 🛠 Building -- the public site is ready; the app is still in production\n\n'
        || replace(
          p.content,
          '- **Where it is at:** the site is live; the product is a clickable walkthrough while the shape gets proven.',
          '- **Where it is at:** the public site is ready; the app is still in production.'
        )
      when 'Infinitext Publishing' then '**Stage:** 🛠 Building -- the site is live and the first titles are queued\n\n' || p.content
      else '**Stage:** ✨ Live -- feedback welcome\n\n' || p.content
    end,
    edited_at = now()
  where p.category_id = brag_board_id
    and p.title in (
      'Saved You a Seat Studios',
      'Infinitext Publishing',
      'Density Legal',
      'Charlee Shae',
      'The Nat Effect',
      'Jasmine''s Jammin Sprouts',
      'Yours CRM',
      'Content Creature',
      'Nellie, your personal shopper',
      'HIVE'
    )
    and p.content not like '**Stage:**%';
end;
$$;

-- News is app-wide now because the board is app-wide. One row, without a
-- deploy-only copy in lib/appNews.ts (migration 207 made this the live source).
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-06',
  'There is a Brag Board for what you are making',
  'Share one project per thread, mark whether it is building, ready for testers, live or paused, and ask every HIVE for the kind of help you want.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
  and not exists (
    select 1 from public.app_news n
    where n.occurred_on = date '2026-09-06'
      and n.title = 'There is a Brag Board for what you are making'
  )
limit 1;

-- ---------------------------------------------------------------------------
-- 2. HIVE-Wide boards are readable and participatory for every HIVE member.
-- ---------------------------------------------------------------------------

-- This read policy already exists live under this name. Re-state it here so
-- the migration file records the complete contract beside the new write half.
drop policy if exists "Any HIVE member can view HIVE-Wide boards" on public.board_categories;
drop policy if exists "Wide categories viewable by any HIVE member" on public.board_categories;
create policy "Wide categories viewable by any HIVE member"
  on public.board_categories for select
  to authenticated
  using (
    reach = 'all_hives'
    and public.community_shares_beyond_hive(community_id)
    and public.is_any_community_member()
  );

drop policy if exists "Any HIVE member can post on HIVE-Wide boards" on public.board_posts;
create policy "Any HIVE member can post on HIVE-Wide boards"
  on public.board_posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and public.is_any_community_member()
    and exists (
      select 1
      from public.board_categories bc
      where bc.id = board_posts.category_id
        and bc.community_id = board_posts.community_id
        and bc.reach = 'all_hives'
        and bc.requires_admin = false
        and public.community_shares_beyond_hive(bc.community_id)
    )
  );

-- A member who started a shared thread from outside the host HIVE must still
-- be able to correct it later. The older author policy's WITH CHECK requires
-- host-HIVE membership, so a separate permissive policy carries the shared
-- case without loosening any board that stays home.
drop policy if exists "Authors can update own HIVE-Wide posts" on public.board_posts;
create policy "Authors can update own HIVE-Wide posts"
  on public.board_posts for update
  to authenticated
  using (
    auth.uid() = author_id
    and exists (
      select 1
      from public.board_categories bc
      where bc.id = board_posts.category_id
        and bc.community_id = board_posts.community_id
        and bc.reach = 'all_hives'
        and public.community_shares_beyond_hive(bc.community_id)
    )
  )
  with check (
    auth.uid() = author_id
    and public.is_any_community_member()
    and exists (
      select 1
      from public.board_categories bc
      where bc.id = board_posts.category_id
        and bc.community_id = board_posts.community_id
        and bc.reach = 'all_hives'
        and public.community_shares_beyond_hive(bc.community_id)
    )
  );

drop policy if exists "Any HIVE member can read HIVE-Wide board replies" on public.board_replies;
create policy "Any HIVE member can read HIVE-Wide board replies"
  on public.board_replies for select
  to authenticated
  using (
    public.is_any_community_member()
    and exists (
      select 1
      from public.board_posts bp
      join public.board_categories bc on bc.id = bp.category_id
      where bp.id = board_replies.post_id
        and bp.community_id = board_replies.community_id
        and bc.community_id = bp.community_id
        and bc.reach = 'all_hives'
        and bp.visibility in ('all_hives', 'public')
        and public.community_shares_beyond_hive(bc.community_id)
    )
  );

drop policy if exists "Any HIVE member can reply on HIVE-Wide boards" on public.board_replies;
create policy "Any HIVE member can reply on HIVE-Wide boards"
  on public.board_replies for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and public.is_any_community_member()
    and exists (
      select 1
      from public.board_posts bp
      join public.board_categories bc on bc.id = bp.category_id
      where bp.id = board_replies.post_id
        and bp.community_id = board_replies.community_id
        and bc.community_id = bp.community_id
        and bc.reach = 'all_hives'
        and bp.visibility in ('all_hives', 'public')
        and bp.is_locked = false
        and public.community_shares_beyond_hive(bc.community_id)
    )
  );

drop policy if exists "Authors can update own HIVE-Wide replies" on public.board_replies;
create policy "Authors can update own HIVE-Wide replies"
  on public.board_replies for update
  to authenticated
  using (
    auth.uid() = author_id
    and exists (
      select 1
      from public.board_posts bp
      join public.board_categories bc on bc.id = bp.category_id
      where bp.id = board_replies.post_id
        and bp.community_id = board_replies.community_id
        and bc.community_id = bp.community_id
        and bc.reach = 'all_hives'
        and bp.visibility in ('all_hives', 'public')
        and public.community_shares_beyond_hive(bc.community_id)
    )
  )
  with check (
    auth.uid() = author_id
    and public.is_any_community_member()
    and exists (
      select 1
      from public.board_posts bp
      join public.board_categories bc on bc.id = bp.category_id
      where bp.id = board_replies.post_id
        and bp.community_id = board_replies.community_id
        and bc.community_id = bp.community_id
        and bc.reach = 'all_hives'
        and bp.visibility in ('all_hives', 'public')
        and public.community_shares_beyond_hive(bc.community_id)
    )
  );

drop policy if exists "Any HIVE member can read HIVE-Wide board reactions" on public.board_reactions;
create policy "Any HIVE member can read HIVE-Wide board reactions"
  on public.board_reactions for select
  to authenticated
  using (
    public.is_any_community_member()
    and (
      exists (
        select 1
        from public.board_posts bp
        join public.board_categories bc on bc.id = bp.category_id
        where bp.id = board_reactions.post_id
          and bp.community_id = board_reactions.community_id
          and bc.community_id = bp.community_id
          and bc.reach = 'all_hives'
          and bp.visibility in ('all_hives', 'public')
          and public.community_shares_beyond_hive(bc.community_id)
      )
      or exists (
        select 1
        from public.board_replies br
        join public.board_posts bp on bp.id = br.post_id
        join public.board_categories bc on bc.id = bp.category_id
        where br.id = board_reactions.reply_id
          and br.community_id = board_reactions.community_id
          and bp.community_id = br.community_id
          and bc.community_id = bp.community_id
          and bc.reach = 'all_hives'
          and bp.visibility in ('all_hives', 'public')
          and public.community_shares_beyond_hive(bc.community_id)
      )
    )
  );

drop policy if exists "Any HIVE member can react on HIVE-Wide boards" on public.board_reactions;
create policy "Any HIVE member can react on HIVE-Wide boards"
  on public.board_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_any_community_member()
    and (
      exists (
        select 1
        from public.board_posts bp
        join public.board_categories bc on bc.id = bp.category_id
        where bp.id = board_reactions.post_id
          and bp.community_id = board_reactions.community_id
          and bc.community_id = bp.community_id
          and bc.reach = 'all_hives'
          and bp.visibility in ('all_hives', 'public')
          and public.community_shares_beyond_hive(bc.community_id)
      )
      or exists (
        select 1
        from public.board_replies br
        join public.board_posts bp on bp.id = br.post_id
        join public.board_categories bc on bc.id = bp.category_id
        where br.id = board_reactions.reply_id
          and br.community_id = board_reactions.community_id
          and bp.community_id = br.community_id
          and bc.community_id = bp.community_id
          and bc.reach = 'all_hives'
          and bp.visibility in ('all_hives', 'public')
          and public.community_shares_beyond_hive(bc.community_id)
      )
    )
  );

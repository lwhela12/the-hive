-- HIVE needs one shared library, not two neighbouring Tech boards that ask
-- members to make the same decision twice. Things We Learned keeps the broad
-- name, moves to HIVE-Wide, and receives the useful active pages from Agentic
-- Coding Principles.
--
-- Nat's old personal principles page is preserved in the archive rather than
-- moved: her current shareable building doctrine is The Build Standard. The
-- older Lucas principle fragments were already archived when his ten ideas
-- were folded into one page, so they stay with the archived source board.

do $$
declare
  tech_hive_id uuid;
  learned_board_id uuid;
  principles_board_id uuid;
  nat_id uuid;
  moved_count integer;
  kept_count integer;
begin
  select id into tech_hive_id
  from public.communities
  where slug = 'tech'
  limit 1;

  if tech_hive_id is null then
    raise exception 'Tech HIVE was not found.';
  end if;

  select id into learned_board_id
  from public.board_categories
  where community_id = tech_hive_id
    and name = 'Things We Learned'
  order by created_at
  limit 1;

  select id into principles_board_id
  from public.board_categories
  where community_id = tech_hive_id
    and name = 'Agentic Coding Principles'
  order by created_at
  limit 1;

  if learned_board_id is null or principles_board_id is null then
    raise exception 'Tech HIVE needs both source boards before they can be consolidated.';
  end if;

  select id into nat_id
  from public.profiles
  where lower(email) = 'natwalstead@gmail.com'
  limit 1;

  -- These are the two live pages that still belong on the shared library
  -- shelf. Replies, reactions and attribution follow their post ids.
  update public.board_posts
  set category_id = learned_board_id
  where community_id = tech_hive_id
    and category_id = principles_board_id
    and archived_at is null
    and title in (
      'Lucas''s agentic coding principles',
      'Expose the job, not the prompt'
    );
  get diagnostics moved_count = row_count;

  select count(*) into kept_count
  from public.board_posts
  where community_id = tech_hive_id
    and category_id = learned_board_id
    and archived_at is null
    and title in (
      'Lucas''s agentic coding principles',
      'Expose the job, not the prompt'
    );

  if kept_count <> 2 then
    raise exception 'Expected 2 active principles pages on Things We Learned after moving %, found %.', moved_count, kept_count;
  end if;

  -- Nat chose The Build Standard as her current page. Keep this older page as
  -- recoverable history without showing two versions of her working rules.
  update public.board_posts
  set
    archived_at = coalesce(archived_at, now()),
    archived_by = coalesce(archived_by, nat_id)
  where community_id = tech_hive_id
    and category_id = principles_board_id
    and title = 'Nat''s agentic coding principles';

  update public.board_categories
  set
    description = 'Hard-won ideas, playbooks, and principles worth passing on. Each thread gives you the short version and links to the live source when it is safe to share.',
    reach = 'all_hives'
  where id = learned_board_id;

  -- The board thread remains the quick read; the Doc remains the one live
  -- source. Google Docs access is granted separately so adding this link never
  -- changes who can edit it.
  update public.board_posts
  set
    content = rtrim(content) || E'\n\n[Read The Build Standard](https://docs.google.com/document/d/1SbSbEA5DhzVl9PKORMXQRRxJpU75Pb1vc7XGp5X0474/edit)',
    edited_at = now()
  where community_id = tech_hive_id
    and category_id = learned_board_id
    and title = 'One standard every app has to clear'
    and content not like '%1SbSbEA5DhzVl9PKORMXQRRxJpU75Pb1vc7XGp5X0474%';

  update public.board_categories
  set
    status = 'archived',
    completed_at = coalesce(completed_at, now()),
    completed_by = coalesce(completed_by, nat_id),
    completion_note = 'Folded into Things We Learned on 2026-09-06. The active Lucas and Expose the job pages moved with their history.'
  where id = principles_board_id;
end;
$$;

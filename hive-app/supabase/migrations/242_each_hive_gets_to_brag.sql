-- Two HIVE-Wide Brag Boards, each with its own HIVE's character.
--
-- Nat, 2026-09-06: Tech is proud of the software, sites and products it
-- builds. OG is proud of the art, performances, crochet, resin bugs,
-- organized spaces and every other thing somebody accomplished. They are the
-- same generous act -- "look what I did!" -- but the HIVE in the title tells
-- the shared room whose work people are stepping into.

do $$
declare
  tech_hive_id uuid;
  og_hive_id uuid;
  nat_id uuid;
  tech_board_id uuid;
  og_board_id uuid;
begin
  select id into tech_hive_id
  from public.communities
  where slug = 'tech'
  limit 1;

  select id into og_hive_id
  from public.communities
  where slug = 'default'
  limit 1;

  select id into nat_id
  from public.profiles
  where lower(email) = 'natwalstead@gmail.com'
  limit 1;

  if tech_hive_id is null or og_hive_id is null or nat_id is null then
    raise exception 'Tech HIVE, OG HIVE and Nat are required for the two Brag Boards.';
  end if;

  select id into tech_board_id
  from public.board_categories
  where community_id = tech_hive_id
    and name in ('Brag Board', 'Tech HIVE Brag Board')
  order by created_at
  limit 1;

  if tech_board_id is null then
    raise exception 'The existing Tech HIVE Brag Board was not found.';
  end if;

  update public.board_categories
  set
    name = 'Tech HIVE Brag Board',
    description = 'Software, sites and products we made or are making. One thread per project -- share the link, mark its stage, and ask for feedback, testers, users, or cheering.',
    icon = '✨',
    reach = 'all_hives'
  where id = tech_board_id;

  select id into og_board_id
  from public.board_categories
  where community_id = og_hive_id
    and name in ('Brag Board', 'OG HIVE Brag Board')
  order by created_at
  limit 1;

  if og_board_id is null then
    insert into public.board_categories (
      community_id,
      name,
      description,
      category_type,
      icon,
      display_order,
      is_system,
      requires_admin,
      requires_approval,
      audience,
      topic_kind,
      status,
      reach,
      created_by
    )
    values (
      og_hive_id,
      'OG HIVE Brag Board',
      'Something you accomplished and want us to see -- artwork, performances, crochet, resin, organizing, or whatever made you proud. One accomplishment per thread.',
      'custom',
      '✨',
      81,
      false,
      false,
      false,
      'community',
      'discussion',
      'active',
      'all_hives',
      nat_id
    )
    returning id into og_board_id;
  else
    update public.board_categories
    set
      name = 'OG HIVE Brag Board',
      description = 'Something you accomplished and want us to see -- artwork, performances, crochet, resin, organizing, or whatever made you proud. One accomplishment per thread.',
      icon = '✨',
      status = 'active',
      reach = 'all_hives'
    where id = og_board_id;
  end if;

  insert into public.board_posts (
    community_id,
    category_id,
    author_id,
    title,
    content,
    is_pinned,
    is_anchored,
    visibility,
    status
  )
  select
    og_hive_id,
    og_board_id,
    nat_id,
    'Start here: brag on yourself',
    $post$**Brag about something you accomplished.** One thing per thread.

**What did you do?** Tell us in plain language.

**Show us:** Add photos, a video or a link if there is one.

**Why are you proud?** This part matters.

**What do you want from us?** Cheering, questions, feedback -- or company next time.

Art, acro, crochet, resin bugs, organized spaces, something you fixed, something you tried: if you are proud of it, it belongs here.$post$,
    true,
    false,
    'all_hives',
    'active'
  where not exists (
    select 1
    from public.board_posts existing
    where existing.category_id = og_board_id
      and existing.title = 'Start here: brag on yourself'
  );

  -- The earlier app-wide note named one generic board. Keep one news item and
  -- let it tell the current two-board truth instead of announcing twice.
  update public.app_news
  set
    title = 'Tech and OG each have a HIVE-Wide Brag Board',
    detail = 'Tech is showing software, sites and products. OG is showing art, performances, crochet, resin, organized spaces and anything else somebody is proud to have accomplished.'
  where occurred_on = date '2026-09-06'
    and title in (
      'There is a Brag Board for what you are making',
      'Tech and OG each have a HIVE-Wide Brag Board'
    );
end;
$$;

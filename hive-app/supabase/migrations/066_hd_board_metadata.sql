-- Add first-class metadata for HD boards and the shared helper log.

alter table public.board_categories
  add column if not exists topic_kind text not null default 'discussion'
  check (topic_kind in ('discussion', 'hd_board', 'helper_log'));

alter table public.board_categories
  add column if not exists goal_title text;

alter table public.board_categories
  add column if not exists owner_user_id uuid references public.profiles(id) on delete set null;

create index if not exists board_categories_topic_kind_idx
  on public.board_categories(community_id, topic_kind);

create index if not exists board_categories_owner_user_idx
  on public.board_categories(community_id, owner_user_id);

update public.board_categories
set
  topic_kind = 'hd_board',
  goal_title = nullif(trim(regexp_replace(name, '^.*HD\\s*[:-]\\s*', '', 'i')), ''),
  audience = 'members'
where category_type = 'custom'
  and topic_kind = 'discussion'
  and (
    name ilike '%HD:%'
    or name ilike '%HD-%'
    or description ilike '%Hummdinger%'
    or description ilike '%High Definition%'
  );

with first_tag as (
  select distinct on (category_id)
    category_id,
    tagged_user_id
  from public.board_category_member_tags
  order by category_id, created_at
)
update public.board_categories category
set owner_user_id = first_tag.tagged_user_id
from first_tag
where category.id = first_tag.category_id
  and category.topic_kind = 'hd_board'
  and category.owner_user_id is null;

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
  created_by,
  topic_kind,
  goal_title,
  audience
)
select
  communities.id,
  '15min HIVE Helpers',
  'Log quick acts of help so Clive can include them in meeting recaps, slide decks, and newsletters.',
  'custom',
  '🤝',
  coalesce((
    select max(existing.display_order) + 1
    from public.board_categories existing
    where existing.community_id = communities.id
  ), 1),
  false,
  false,
  false,
  null,
  'helper_log',
  '15min HIVE Helpers',
  'community'
from public.communities communities
on conflict (community_id, name) do update
set
  topic_kind = 'helper_log',
  goal_title = '15min HIVE Helpers',
  audience = 'community',
  description = excluded.description;

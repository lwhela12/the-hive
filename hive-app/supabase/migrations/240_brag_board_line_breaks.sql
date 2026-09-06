-- Render the Brag Board's seeded Markdown with real line breaks.
--
-- Migration 239 used ordinary PostgreSQL strings containing `\n`. With
-- standard_conforming_strings enabled, those two characters stay literal and
-- show up on board-card previews. Keep the applied migration immutable and
-- normalize only the one Tech-owned Brag Board here.

do $$
declare
  brag_board_id uuid;
begin
  select bc.id into brag_board_id
  from public.board_categories bc
  join public.communities c on c.id = bc.community_id
  where c.slug = 'tech'
    and bc.name = 'Brag Board'
  order by bc.created_at
  limit 1;

  if brag_board_id is null then
    raise exception 'Tech HIVE Brag Board was not found.';
  end if;

  update public.board_posts
  set
    content = replace(content, E'\\n', E'\n'),
    edited_at = now()
  where category_id = brag_board_id
    and position(E'\\n' in content) > 0;
end;
$$;

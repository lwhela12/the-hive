-- Clean goal titles inferred from legacy HD board names.

update public.board_categories
set goal_title = nullif(trim(regexp_replace(name, '^.*HD[[:space:]]*[:-][[:space:]]*', '', 'i')), '')
where topic_kind = 'hd_board'
  and (
    goal_title is null
    or goal_title = name
    or goal_title ilike '%HD:%'
    or goal_title ilike '%HD-%'
  );

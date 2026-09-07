-- The HIVE Help board is the home for the shared community focus. "Helpers"
-- made it sound like a roster of people; keep the existing id and history, but
-- give every current surface the name members use.

update public.board_categories
set name = 'HIVE Help',
    goal_title = 'HIVE Help'
where topic_kind = 'helper_log'
  and name in ('HIVE Helpers', '15min HIVE Helpers');

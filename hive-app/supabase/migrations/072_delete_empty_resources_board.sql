-- Remove the empty legacy Resources board after its posts moved to HIVE Approved.

delete from public.board_categories category
where lower(category.name) = 'resources'
  and category.status = 'archived'
  and not exists (
    select 1
    from public.board_posts post
    where post.category_id = category.id
  );

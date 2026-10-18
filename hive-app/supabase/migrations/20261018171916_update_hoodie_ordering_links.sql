-- The interactive clothing configurator replaces the old PDF anywhere a
-- hoodie-season board post pointed members at it. Keep members' surrounding
-- wording and only rewrite the obsolete destination/callout.
update public.board_posts
set
  content = rtrim(
    regexp_replace(
      regexp_replace(
        content,
        'https?://[^[:space:]<>()]+\.pdf[^[:space:]<>()]*',
        'https://app.the-hive.app/hoodie-studio/',
        'gi'
      ),
      '(the )?pdf([ -]+ordering)?([ -]+guide|[ -]+order form)?',
      'the interactive clothing ordering site',
      'gi'
    )
  ) || case
    when content ilike '%https://app.the-hive.app/hoodie-studio/%' then ''
    else E'\n\nChoose your garment, color, size and artwork: https://app.the-hive.app/hoodie-studio/\n\nOG HIVE orders are covered by Honey Pot dues. Other HIVE members order at cost. Nat prepares the provider design and confirms the final design and amount by screenshot before ordering.'
  end,
  attachments = case
    when jsonb_typeof(attachments) = 'array' then (
      select coalesce(jsonb_agg(attachment order by position), '[]'::jsonb)
      from jsonb_array_elements(attachments) with ordinality as item(attachment, position)
      where coalesce(attachment ->> 'mime_type', '') <> 'application/pdf'
        and coalesce(attachment ->> 'filename', '') !~* '\.pdf$'
    )
    else attachments
  end,
  edited_at = now()
where
  title ilike '%hoodie season%'
  or content ilike '%hoodie season%'
  or (
    (title ilike '%hoodie%' or content ilike '%hoodie%' or content ilike '%sweatshirt%')
    and (content ilike '%.pdf%' or content ilike '%PDF ordering%' or content ilike '%PDF guide%')
  );

update public.board_replies
set
  content = rtrim(
    regexp_replace(
      regexp_replace(
        content,
        'https?://[^[:space:]<>()]+\.pdf[^[:space:]<>()]*',
        'https://app.the-hive.app/hoodie-studio/',
        'gi'
      ),
      '(the )?pdf([ -]+ordering)?([ -]+guide|[ -]+order form)?',
      'the interactive clothing ordering site',
      'gi'
    )
  ) || case
    when content ilike '%https://app.the-hive.app/hoodie-studio/%' then ''
    else E'\n\nChoose your HIVE clothing: https://app.the-hive.app/hoodie-studio/'
  end,
  attachments = case
    when jsonb_typeof(attachments) = 'array' then (
      select coalesce(jsonb_agg(attachment order by position), '[]'::jsonb)
      from jsonb_array_elements(attachments) with ordinality as item(attachment, position)
      where coalesce(attachment ->> 'mime_type', '') <> 'application/pdf'
        and coalesce(attachment ->> 'filename', '') !~* '\.pdf$'
    )
    else attachments
  end,
  edited_at = now()
where
  content ilike '%hoodie season%'
  or (
    (content ilike '%hoodie%' or content ilike '%sweatshirt%')
    and (content ilike '%.pdf%' or content ilike '%PDF ordering%' or content ilike '%PDF guide%')
  );

-- A board-activity summary may still quote the old link until it expires.
-- It is derived cache, so clear it and let Clive rebuild it from the posts.
delete from public.context_summaries
where summary_type = 'board_activity'
  and user_id is null
  and conversation_id is null
  and community_id in (
    select distinct community_id
    from public.board_posts
    where content ilike '%https://app.the-hive.app/hoodie-studio/%'
  );

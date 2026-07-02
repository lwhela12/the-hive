-- Preserve board-reply photos/files when HD-board threads are folded into wishes.

alter table public.wish_comments
  add column if not exists attachments jsonb default null;

comment on column public.wish_comments.attachments is
  'Array of attachment objects copied from board replies for wish comments.';

with source_reply_attachments as (
  select distinct on (wish_comment.id)
    wish_comment.id as comment_id,
    reply.attachments
  from public.wish_comments as wish_comment
  join public.wishes as wish
    on wish.id = wish_comment.wish_id
   and wish.community_id = wish_comment.community_id
  join public.board_replies as reply
    on reply.post_id = wish.source_board_post_id
   and reply.community_id = wish_comment.community_id
   and reply.author_id = wish_comment.user_id
   and reply.created_at = wish_comment.created_at
  where coalesce(
    case
      when jsonb_typeof(reply.attachments) = 'array' then jsonb_array_length(reply.attachments)
      else 0
    end,
    0
  ) > 0
  order by wish_comment.id, reply.id
)
update public.wish_comments as wish_comment
set
  attachments = source.attachments,
  content = case
    when wish_comment.content ~* 'migrated attachments?:'
      then coalesce(
        nullif(
          btrim(
            regexp_replace(
              wish_comment.content,
              E'[[:space:]]*Migrated attachments?:[[:space:]]*(\\n[[:space:]]*-[^\\n]*)*[[:space:]]*$',
              '',
              'i'
            )
          ),
          ''
        ),
        'Shared an attachment.'
      )
    else wish_comment.content
  end
from source_reply_attachments as source
where wish_comment.id = source.comment_id
  and coalesce(
    case
      when jsonb_typeof(wish_comment.attachments) = 'array' then jsonb_array_length(wish_comment.attachments)
      else 0
    end,
    0
  ) = 0;

insert into public.wish_comments (
  wish_id,
  user_id,
  community_id,
  content,
  attachments,
  created_at
)
select
  wish.id,
  reply.author_id,
  reply.community_id,
  coalesce(
    nullif(
      btrim(
        regexp_replace(
          coalesce(reply.content, ''),
          E'[[:space:]]*Migrated attachments?:[[:space:]]*(\\n[[:space:]]*-[^\\n]*)*[[:space:]]*$',
          '',
          'i'
        )
      ),
      ''
    ),
    'Shared an attachment.'
  ),
  reply.attachments,
  reply.created_at
from public.board_replies as reply
join public.wishes as wish
  on wish.source_board_post_id = reply.post_id
 and wish.community_id = reply.community_id
where coalesce(
    case
      when jsonb_typeof(reply.attachments) = 'array' then jsonb_array_length(reply.attachments)
      else 0
    end,
    0
  ) > 0
  and not exists (
    select 1
    from public.wish_comments as existing
    where existing.wish_id = wish.id
      and existing.user_id = reply.author_id
      and existing.created_at = reply.created_at
  );

update public.wish_comments as wish_comment
set content = coalesce(
  nullif(
    btrim(
      regexp_replace(
        wish_comment.content,
        E'[[:space:]]*Migrated attachments?:[[:space:]]*(\\n[[:space:]]*-[^\\n]*)*[[:space:]]*$',
        '',
        'i'
      )
    ),
    ''
  ),
  'Shared an attachment.'
)
where wish_comment.content ~* 'migrated attachments?:'
  and coalesce(
    case
      when jsonb_typeof(wish_comment.attachments) = 'array' then jsonb_array_length(wish_comment.attachments)
      else 0
    end,
    0
  ) > 0;

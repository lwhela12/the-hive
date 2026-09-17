-- Nat confirmed there was one February newsletter: the February 16 issue
-- titled "The Buzz — the first one", which recapped January. This February 23
-- import has no newsletter_sends receipt and was not the separate March send.
-- Keep the source row recoverable, but do not show it as a second February
-- mailing in The Buzz archive.

update public.board_posts
set archived_at = coalesce(archived_at, now())
where id = '79aac910-1a1f-444c-bc0b-7af1fe9e96ef'::uuid
  and title = 'The Buzz — February Recap'
  and created_at = timestamptz '2026-02-23 12:00:00+00'
  and not exists (
    select 1
    from public.newsletter_sends send
    where send.post_id = board_posts.id
      and send.mode = 'live'
  );

-- Follow-up evidence corrected the earlier assumption: Nat remembered one
-- issue per month, and the retained Wix reference identifies this exact row as
-- "H.I.V.E. Newsletter #2, March 2026" posted early on February 23. Restore
-- the source row and give the imported title its issue-month identity. The app
-- deliberately labels archive cards by issue month rather than this Wix post
-- date, so the shelf reads February through September once each.

update public.board_posts
set archived_at = null,
    title = 'The Buzz — March 2026: February Recap'
where id = '79aac910-1a1f-444c-bc0b-7af1fe9e96ef'::uuid
  and title = 'The Buzz — February Recap'
  and created_at = timestamptz '2026-02-23 12:00:00+00'
  and not exists (
    select 1
    from public.newsletter_sends send
    where send.post_id = board_posts.id
      and send.mode = 'live'
  );

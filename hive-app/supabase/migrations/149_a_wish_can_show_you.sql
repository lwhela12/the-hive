-- A wish can show you the thing.
--
-- Nat, 2026-08-05, looking at the wish composer: *"shouldn't it also have a clip
-- to add attachments?"*
--
-- It should, and it could not: `wish_comments` has carried an `attachments`
-- column since migration 101, but the wish itself never had one. So a picture of
-- the broken fence could only ever be a REPLY to the ask, sitting underneath it
-- with somebody's name and a timestamp on it, rather than being part of the ask.
--
-- Same shape as `wish_comments.attachments` and `board_posts.attachments`, so
-- everything that already knows how to render a member's upload keeps working:
-- a JSON list of objects, each with the stored URL and enough about the file to
-- draw it. The bucket is private, so these render through SignedImage.
alter table public.wishes
  add column if not exists attachments jsonb;

comment on column public.wishes.attachments is
  'Pictures and files that are part of the ask itself. Same shape as '
  'wish_comments.attachments. Rendered through components/ui/SignedImage.tsx '
  'because the attachments bucket is private (migration 146).';

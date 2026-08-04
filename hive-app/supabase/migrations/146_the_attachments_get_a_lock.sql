-- The attachments bucket stops being public.
--
-- Migration 026 created it with `public = true` and a SELECT policy granting the
-- `public` role. That does two things, and the second is the bad one: every file
-- gets a permanent open web address, AND the bucket's LISTING is open — so
-- nobody has to guess a URL. An audit on 2026-08-04, holding no credentials at
-- all, listed the bucket (the folders are member ids), walked into a member's
-- folder, and downloaded a 428KB image. HTTP 200.
--
-- 182 files, 382MB. Board attachments, wish-comment attachments, and
-- direct-message pictures — private images from a private community, available
-- to anyone who thought to look.
--
-- Nat asked the obvious question when told: "i'm not sure how a stranger can get
-- our pics, when its all members only?" The answer is that the DATABASE was
-- members-only and the FILES never were. Two systems, one of them locked. The
-- row saying "this message has a photo" was protected all along; the photo was
-- sitting on the open internet next to it.
--
-- Reading now requires being signed in AND a member of a HIVE, and the app asks
-- for short-lived signed links at render time (`lib/signedAttachment.ts`). The
-- stored public URLs in `board_posts.attachments`, `room_messages.attachments`
-- and `wish_comments.attachments` are NOT rewritten — the app reads the object
-- key back out of them — so 29 rows of history keep working untouched.

update storage.buckets set public = false where id = 'attachments';

drop policy if exists "Attachments are publicly accessible" on storage.objects;

-- Members of a HIVE, and nobody else. `is_any_community_member()` is the same
-- helper the cross-HIVE board policies use: signed in, and actually in at least
-- one HIVE. A signed-in stranger who belongs to nothing gets nothing.
create policy "Attachments are for members"
  on storage.objects for select
  using (bucket_id = 'attachments' and public.is_any_community_member());

-- Writing was already correct and stays exactly as it was: you may only put
-- files inside a folder named after your own user id.

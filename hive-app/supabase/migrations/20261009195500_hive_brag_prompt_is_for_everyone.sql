-- The shared HIVE Brag Board is for every kind of win, not only Tech projects.
-- Keep its existing pinned thread, replies, and optional "Use this format"
-- action; only make the starter invite the whole community honestly.
update public.board_posts
set
  content = $$**Share something you're proud of.** A project, performance, creative work, kind thing, brave step, happy discovery — anything you want to celebrate. One brag per thread.

**What happened?** A sentence or two in your own words.

**Who made it?** Name yourself and any real collaborators.

**Want to share more?** Add a link, photo, video, or whatever helps people see it.

**Want anything from us?** Feedback, testers, users, introductions, cheering — or nothing at all.

Come back with an update whenever the story grows.$$,
  edited_at = now()
where id = '54d79f76-7b86-48c3-a86a-11f39d6f55d4'
  and is_pinned = true
  and archived_at is null;

update public.app_news
set detail = 'Share something you made, accomplished, or are working on in one place — the optional starter works for every kind of win. Every HIVE can see it, cheer you on, and help where you ask.'
where id = 46;

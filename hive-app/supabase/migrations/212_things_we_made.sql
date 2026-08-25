-- Tech HIVE's 'Things We Made' board — one thread per project, never one
-- studio megathread, so each thing can be poked and answered on its own
-- (Trello: 'Nellie gets its own beta-feedback ask'). Seeded with what is on
-- savedyouaseatstudios.com, which is the line for what is safe to name here.
-- Members add their own; the pinned post says how.
--
-- Threads are ordered by created_at descending under the pinned post, so the
-- inserts below run in reverse reading order on purpose.

insert into public.board_categories (
  community_id, name, description, category_type, icon, display_order,
  is_system, requires_admin, requires_approval, audience, topic_kind,
  status, reach, created_by
)
select c.id, 'Things We Made', 'Every project any of us has shipped gets one thread. What it is, where it lives, and what it still needs. Post yours — this board is not just ours.',
  'custom', '🛠️', 80, false, false, false, 'community', 'discussion',
  'active', 'hive', p.id
from public.communities c
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_categories x
    where x.community_id = c.id and x.name = 'Things We Made'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Saved You a Seat Studios', $post$- **Who:** Nat and Lucas.
- **Where:** [savedyouaseatstudios.com](https://savedyouaseatstudios.com)
- **What it is:** the studio everything else on this board comes out of — sites, software, film, and writing. Every project here has an entry there, with the real role named.
- **Where it is at:** live.
- **What helps:** read the front page cold and tell us what you think we do. If that does not match, the page is wrong.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Saved You a Seat Studios'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Infinitext Publishing', $post$- **Who:** Nat and Lucas.
- **Where:** [infinitextpublishing.com](https://infinitextpublishing.com)
- **What it is:** a small indie press. Obscure public-domain works brought back with new covers, a foreword and bonus back matter, plus room for new voices.
- **Where it is at:** the press is built and the first titles are queued; the site is live.
- **What helps:** if you know a forgotten book that deserves another run, say it here. That is genuinely the input we are short of.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Infinitext Publishing'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Density Legal', $post$- **Who:** Lucas, with Brietta and Laura.
- **Where:** [density.legal](https://density.legal)
- **What it is:** a legal intelligence workspace that turns case files, governing law and firm knowledge into dense, source-backed analysis, and learns from the attorneys who use it.
- **Where it is at:** live, with real customers.
- **What helps:** Brietta and Laura know this one from the inside, so this thread is theirs as much as ours. For everyone else: read the site cold and say what you think it does.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Density Legal'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Charlee Shae', $post$- **Who:** Nat, for Charlee Shae and Sara Knauer.
- **Where:** [charleeshae.com](https://charleeshae.com)
- **What it is:** a performance and booking site for a Las Vegas duo aerial straps act, built around their reel.
- **Where it is at:** live, and Charlee loves it — which is the bar for a client site.
- **What helps:** pretend you are booking an act for an event. See how far you get before you would give up and text someone instead.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Charlee Shae'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'The Nat Effect', $post$- **Who:** Nat.
- **Where:** [thenateffect.com](https://thenateffect.com)
- **What it is:** a dark night-garden storefront built around one idea — co-create your piece. Tees, mugs, phone cases, art, made with the customer rather than picked off a shelf.
- **Where it is at:** live.
- **What helps:** open it on a phone, at night. Does it feel like the shop it is trying to be?$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'The Nat Effect'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Jasmine''s Jammin Sprouts', $post$- **Who:** Nat, for Jasmine.
- **Where:** [jasminesjamminsprouts.com](https://jasminesjamminsprouts.com)
- **What it is:** the family-facing home for a homeschool preschool. Parents find the program and enrol; class itself runs inside the app, behind the door.
- **Where it is at:** live, with September's curriculum being walked day by day right now.
- **What helps:** read it as a parent deciding whether to sign their kid up. Does it answer the question you would actually ask first?$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Jasmine''s Jammin Sprouts'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Yours CRM', $post$- **Who:** Nat.
- **Where:** [yourscrm.com](https://yourscrm.com)
- **What it is:** a CRM that takes on your brand, your voice, your audience, your pipeline and your follow-up rhythm. One account holds up to five projects, because most people wear more than one hat.
- **Where it is at:** the site is live; the product is a clickable walkthrough while the shape gets proven.
- **What helps:** walk it as somebody who has never been sold a CRM before. Point at the first sentence where you stopped following.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Yours CRM'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Content Creature', $post$- **Who:** Nat, built with Ems — who is in this HIVE.
- **Where:** [contentcreature.app](https://contentcreature.app)
- **What it is:** pick a product, a trend, a pillar and a platform, and it hands back the caption, the hashtags, and the prompt for the image. It exists to replace a spreadsheet somebody was living in.
- **Where it is at:** live. Free to sign up and look around, $5 a month to unlock it.
- **What helps:** bring a brand you actually run. The real question is whether what comes out is postable as-is, or whether you rewrite it first.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Content Creature'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Nellie, your personal shopper', $post$- **Who:** Nat.
- **Where:** [usenellie.com](https://usenellie.com)
- **What it is:** tell Nellie what you are hunting for and she watches Nellis Auction every five minutes, across all six of its cities, and emails you when something matches. You still do the buying — she never bids.
- **Where it is at:** live and working. She is not being promoted anywhere yet, so this group is the first real test.
- **What helps — this is the ask:** sign in, give her one thing you would genuinely buy, and let her run for a week. Then come back here and say: did the matches make sense, did the email arrive at a moment you could act on, and would you have bought any of it?$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Nellie, your personal shopper'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'HIVE', $post$The app you are reading this in.

- **Who:** Nat and Lucas.
- **Where:** [app.the-hive.app](https://app.the-hive.app) · the public side is [the-hive.app](https://the-hive.app)
- **What it is:** a home for a small group — members, boards, wishes, meetings, and a monthly rhythm that keeps itself moving.
- **Where it is at:** live, and in daily use by three HIVEs. It updates itself now, so opening it puts you on the newest version.
- **What helps:** tell us the exact moment you did not know what to press. That moment is the bug, even when nothing broke.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'HIVE'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Start here: what this board is', $post$One thread per project. Not one big thread with everything in it.

**Post yours.** Anything you have made — shipped, half-built, or put down on purpose. Say what it is, where it lives, where it is at, and what kind of feedback would actually help you. Steal the shape of the threads below.

**Poke someone else's.** Open the link. Use it the way a real person would, on your own phone, without being careful. Then reply with the moment you did not know what to press.

The threads below are Nat and Lucas's, and they are here to be used rather than admired. The most useful reply is the small annoying one nobody else will mention.$post$, true, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Made'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Start here: what this board is'
  );

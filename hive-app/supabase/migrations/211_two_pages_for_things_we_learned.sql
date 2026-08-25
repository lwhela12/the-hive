-- Two threads for Tech HIVE's Things We Learned board, ahead of the Sep 3
-- meeting (Brietta, Laura and Steele's first). Nat's 2026-08-25 voice memo asked
-- for view-only links to the real docs; the Trello item asked for short original
-- blurbs instead, because 'The Productization of Nat's Life' opens with Nat's
-- personal history and is not shareable. The blurb wins for that one. Whether the
-- Build Standard doc itself gets linked is still Nat's call — no link here yet.
-- Idempotent by board + title, same shape as 161.

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'Productizing your own life', $post$**Where it stands.** An assistant that works across your whole life needs a written doctrine, not a fresh prompt every time. The shape that holds up: one doc that says how to help you, a plain folder of files the agent reads before it does anything, and one handoff note per session. Everything else — trackers, meeting notes, this app — hangs off those.

**Why.** Every session starts cold. Without something written down you re-explain your standards, your tone and your project list each time, and you get a slightly different answer each time. Writing it once turned a helpful chatbot into something that picks up where the last session stopped.

**Use it like this.** Three pieces, and that is the whole trick:

- **The doctrine** — who you are, how you work, what "done" means, and the rules you have already argued your way to. Written as law, not as vibes.
- **A folder per project** — one status file, one handoff note per session, and an append-only receipts folder so nothing gets overwritten.
- **An entry-point file at the root** that tells the agent what to read and in what order. Without it, the agent picks.

The handoff note is the load-bearing one. Last thing every session: what shipped, what is still open, and the exact prompt to paste tomorrow.

**The good objection.** A doctrine is only true if you maintain it. A stale rule is worse than no rule, because the agent follows it confidently and you cannot tell from the output. Anything that changes gets edited the day it changes.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Learned'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Productizing your own life'
  );

insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned, is_anchored, visibility, status
)
select c.id, bc.id, p.id, 'One standard every app has to clear', $post$**Where it stands.** Everything we ship has to clear the same bar, and the bar lives in one doc rather than in whoever happens to be building. It is not a style guide. It is the list of things we have already got wrong once.

**Why.** The same bugs kept arriving on different projects. A Refresh button that did not refresh. A screen you land on with no idea what it is. An email that mass-sent before a human read it. Writing the answer down once means the next project starts at the answer instead of iterating back to it.

**Use it like this.** The parts that carry the most weight:

- **Walk it before you call it done.** Check the claim, not the code. If the email says "it is on Home", open the email, press the button, and see what happens.
- **Build only the MVP.** Every other good idea gets written down the second it is said, and given a later phase.
- **One feature at a time, finished end to end.** One that genuinely works beats ninety that almost do.
- **Change it in one place, change it everywhere.** A rule decided once gets swept across every screen in the same pass, so the person who found it never has to find instances two through six.
- **Every screen explains itself.** A stranger lands on it and knows what to do next.
- **Movement means it is working.** Every tap acknowledges itself, then shows it is thinking. A person who cannot tell the difference taps again.
- **Nothing mass-sends until a human has seen that send.** A monthly email is twelve approvals a year, not one.

Underneath sits a numbered pass you run when a project is opened, so every miss becomes a dated item on that project's card.

**The good objection.** A standard this specific only travels so far — some of it is taste rather than physics. The test is whether breaking a rule is a decision with a reason written down, or just a miss.$post$, false, false, 'members', 'active'
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Things We Learned'
cross join lateral (select id from public.profiles where email = 'natwalstead@gmail.com' limit 1) p
where c.slug = 'tech'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'One standard every app has to clear'
  );

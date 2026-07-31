-- What the public site is allowed to see
--
-- Nat wants an event marked "Everyone's invited" in the app to show up on the
-- public site by itself (2026-07-31). The risky way to do that is to open a
-- row-level policy on public.events to anonymous visitors: get the condition
-- slightly wrong and the internet reads members' house addresses and meet links.
--
-- So anonymous visitors never touch the events table at all. They get this
-- view, which is a fixed, hand-picked list of columns over a fixed set of rows.
-- There is no query anyone can write against it that returns anything else.
--
-- Left out on purpose:
--   meet_link  -- a live Google Meet link anyone could walk into
--   created_by, related_user_id  -- who is involved is members' business
--   event_type -- meetings and birthdays are members-only by nature anyway
--
-- Past events drop off on their own, so the site never shows a stale calendar.

create or replace view public.public_events as
select
  e.id,
  e.title,
  e.description,
  e.event_date,
  e.end_date,
  e.event_time,
  e.location
from public.events e
join public.communities c on c.id = e.community_id
where e.visibility = 'public'
  and c.slug = 'default'
  and coalesce(e.end_date, e.event_date) >= current_date;

-- The view runs as its owner, which is the point: it reads the events table on
-- the visitor's behalf without granting the visitor any access to that table.
alter view public.public_events set (security_invoker = false);

revoke all on public.public_events from anon, authenticated;
grant select on public.public_events to anon, authenticated;

comment on view public.public_events is
  'Upcoming events marked "Everyone''s invited", safe columns only. Read by the public site at the-hive.app. Anonymous visitors have no access to public.events itself.';

-- Nat's 17 September phone pass found four places where the app's operating
-- truth and its screen had drifted apart.

-- Steele already joined Tech HIVE. His older "any HIVE" interest row used a
-- second email address, so it remained in OG and Production as though he still
-- needed placing. Preserve the record and close its stage; never delete it.
update public.waitlist
set status = 'joined'
where id = '4e640c3f-828d-4f4c-b7e4-8d8646c0dda5'
  and status = 'new';

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-17',
  'Every issue of The Buzz is back on the shelf',
  'The full February-through-September run appears in The Buzz again, including the issues sent before HIVE had its current send log.',
  owner.id
from (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1 from public.app_news existing
  where existing.title = 'Every issue of The Buzz is back on the shelf'
);

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-17',
  'App Feedback goes straight to Nat’s inbox',
  'Send a note or screenshot once. Shipped fixes come back through What’s New, with no second support inbox to check.',
  owner.id
from (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1 from public.app_news existing
  where existing.title = 'App Feedback goes straight to Nat’s inbox'
);

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-17',
  'Home and Boards fit their phone-sized folders',
  'Upcoming Events keeps its full name, Year calendar says what it opens, and long one-word board names stay inside their cards.',
  owner.id
from (
  select profile.id
  from public.profiles profile
  where profile.is_owner = true
  order by profile.created_at
  limit 1
) owner
where not exists (
  select 1 from public.app_news existing
  where existing.title = 'Home and Boards fit their phone-sized folders'
);

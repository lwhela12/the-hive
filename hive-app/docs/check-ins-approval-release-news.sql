-- PENDING RELEASE ONLY. Not executed by this change.
-- Publish after the parent explicitly releases and verifies the check-ins and
-- approval switches. Run as the authenticated owner (created_by = auth.uid()).
-- lib/appNews.ts is a frozen baseline; current news belongs in app_news.
insert into public.app_news (occurred_on, title, detail)
select current_date,
  'Complete your HIVE check-ins together, and find past answers in one place',
  'Owners can approve each email template in Admin; changed wording needs a fresh approval.'
where not exists (
  select 1 from public.app_news
  where title = 'Complete your HIVE check-ins together, and find past answers in one place'
);

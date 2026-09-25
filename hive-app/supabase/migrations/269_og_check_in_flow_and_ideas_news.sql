-- The OG meeting check-in now gives each meeting its own short idea choices.
insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-25',
  'Before we meet is easier to follow and has new idea choices each meeting',
  'Start with your plans, share how you are arriving, review open HIVE things, then look back and choose an idea for next month. Nat can set up to three HIVE Help and Hang choices for each meeting, and you can suggest your own. Drafted by Codex on Nat’s behalf.',
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
  where existing.occurred_on = date '2026-09-25'
    and existing.title = 'Before we meet is easier to follow and has new idea choices each meeting'
);

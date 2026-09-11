-- Nat, 2026-09-11: every member may choose "notify me about everything,"
-- defaulting off for everybody except Nat. A member's subscription is scoped
-- by notify-admin-activity to the HIVE(s) they actually belong to; owners may
-- keep the cross-HIVE view.

begin;

alter table public.profiles
  alter column email_admin_activity_enabled set default false;

update public.profiles
  set email_admin_activity_enabled = (lower(email) = 'natwalstead@gmail.com');

comment on column public.profiles.email_admin_activity_enabled is
  'Member choice to receive activity mail for their own HIVEs. Defaults off; Nat starts on.';

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-11',
  'HIVE activity email is your choice',
  'Open Settings and choose Notify me about everything when you want daily answers, board activity, and wishes from your HIVE in your inbox.',
  p.id
from public.profiles p
where lower(p.email) = 'natwalstead@gmail.com'
  and not exists (
    select 1
    from public.app_news n
    where n.title = 'HIVE activity email is your choice'
  )
limit 1;

commit;

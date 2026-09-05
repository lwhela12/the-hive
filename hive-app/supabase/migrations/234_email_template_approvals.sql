-- Reviewed approval only: Nat explicitly approved these three generic templates.
-- Local migration for review; applying it is a separate release action.
create table if not exists public.email_template_approvals (
  template_key text primary key check (template_key in ('message','mention','boardReply','checkIn','monthCheckIn')),
  revision text not null check (revision ~ '^[0-9a-f]{64}$'),
  approved boolean not null default false,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz not null default now()
);
alter table public.email_template_approvals enable row level security;
-- Writes must pass email-preview's verified owner + current revision gate.
revoke all on public.email_template_approvals from anon, authenticated;
grant all on public.email_template_approvals to service_role;
insert into public.email_template_approvals (template_key, revision, approved) values
('message', 'd544f10f22d24705b51e0c5384d573dff80df1c348e5f59c953427c3f4c29957', true),
('mention', '288aa9b5c97745f242e5aec213856867d43d4a050e18b7ff0b7af41b5e8053e2', true),
('boardReply', 'a79bdd5d1a81e8c8c55caa50e27bfe92d6117ab30fdf1ff94676d56ef6922e79', true),
('checkIn', 'f4adbf2f1c7a47badb580ce8753a666628d270d79ba99b8e0efcf77e1bea577e', false),
('monthCheckIn', '049b1e649998580174cc581978f49193f72aaaf50858434bd1cf8285c9e7562f', false)
on conflict (template_key) do nothing;

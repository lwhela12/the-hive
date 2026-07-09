-- In-app Meeting Helper deck: admin-editable slide content (News from Nat,
-- meet-up plans, wrap-up notes) lives per community as jsonb.

alter table public.communities
  add column if not exists meeting_helper_notes jsonb;

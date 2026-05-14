-- Allow completed personal tasks to be hidden from the home to-do list.
alter table public.action_items
  add column if not exists archived_at timestamptz;

create index if not exists idx_action_items_home_list
  on public.action_items (community_id, assigned_to, archived_at, completed, created_at desc);

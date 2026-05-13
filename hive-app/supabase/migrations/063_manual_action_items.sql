-- Allow members to add personal tasks that did not come from meeting notes.
alter table public.action_items
  alter column meeting_id drop not null;

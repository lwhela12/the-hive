-- A mistaken to-do should be repairable without erasing what happened.
-- Archiving already kept the row; these fields make edits and archives
-- explain themselves, while leaving every existing task unchanged.

alter table public.action_items
  add column if not exists original_description text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

comment on column public.action_items.original_description is
  'The description before the first edit. Kept so corrections do not erase the original meeting jot.';

comment on column public.action_items.edited_at is
  'When the task description was most recently corrected.';

comment on column public.action_items.edited_by is
  'The member or HIVE admin who most recently corrected the task description.';

comment on column public.action_items.archived_by is
  'The member, admin, or automated workflow that retired this task without deleting it.';

comment on column public.action_items.archive_reason is
  'A stable machine-readable reason for archiving, such as member_archived_from_home or replaced_by_reviewed_meeting_notes.';

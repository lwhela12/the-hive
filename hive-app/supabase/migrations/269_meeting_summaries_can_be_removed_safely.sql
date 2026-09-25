-- A stray call recording should be removable from Meeting Summaries without
-- destroying the transcript or anything attached to it.  Archive the row,
-- hide archived rows from ordinary reads, and keep the write behind one
-- admin-only RPC so the client never receives broad delete permission.

alter table public.meetings
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists meetings_active_by_community_date_idx
  on public.meetings (community_id, date desc)
  where archived_at is null;

-- Nat identified this exact 6 September row as an accidental test recording.
-- It has no summary, audio, linked calendar event, action items, transcription
-- job, survey, or import receipt.  Remove it from the live shelf while keeping
-- the raw record recoverable.
update public.meetings
set
  archived_at = now(),
  archived_by = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359'
where id = 'cf320e54-ad44-4206-ade3-b040b7a4f488'
  and community_id = 'e38d99a8-3aa8-4ace-8381-e56bb9991cf9'
  and date = date '2026-09-06'
  and summary is null
  and audio_url is null
  and linked_event_id is null
  and archived_at is null;

drop policy if exists "Meetings viewable by members" on public.meetings;
create policy "Meetings viewable by members"
  on public.meetings for select
  using (
    archived_at is null
    and public.is_community_member(community_id)
  );

create or replace function public.archive_meeting_summary(p_meeting_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  select meeting.community_id
  into v_community_id
  from public.meetings meeting
  where meeting.id = p_meeting_id;

  if v_community_id is null then
    raise exception 'Meeting summary not found' using errcode = 'P0002';
  end if;

  if not public.is_community_admin(v_community_id) then
    raise exception 'Only HIVE admins can remove meeting summaries' using errcode = '42501';
  end if;

  update public.meetings
  set
    archived_at = coalesce(archived_at, now()),
    archived_by = coalesce(archived_by, auth.uid())
  where id = p_meeting_id;

  return true;
end;
$$;

revoke all on function public.archive_meeting_summary(uuid) from public;
revoke all on function public.archive_meeting_summary(uuid) from anon;
grant execute on function public.archive_meeting_summary(uuid) to authenticated;

comment on function public.archive_meeting_summary(uuid) is
  'Admin-only removal from Meeting Summaries. The row is archived, never hard-deleted.';

create or replace function public.guard_meeting_archive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    if not public.is_community_admin(old.community_id) then
      raise exception 'Only HIVE admins can change a meeting summary archive state'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_meeting_archive_fields on public.meetings;
create trigger guard_meeting_archive_fields
before update on public.meetings
for each row execute function public.guard_meeting_archive_fields();

insert into public.app_news (occurred_on, title, detail, created_by)
select
  date '2026-09-25',
  'Admins can remove a stray meeting summary',
  'Meeting Summaries now has a clearly labelled Remove summary button. The summary leaves the list, while its record stays recoverable. Drafted by Codex on Nat’s behalf.',
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
    and existing.title = 'Admins can remove a stray meeting summary'
);

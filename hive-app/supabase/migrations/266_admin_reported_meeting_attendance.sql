-- A meeting-specific report from an admin is distinct from a member's survey.
create table public.meeting_attendance_reports (
  meeting_id uuid not null references public.events(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attendance text check (attendance in ('in_person', 'remote', 'missing')),
  hd_wish text not null default '',
  help_idea text not null default '',
  reported_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (meeting_id, user_id),
  constraint meeting_report_has_content check (
    attendance is not null or btrim(hd_wish) <> '' or btrim(help_idea) <> ''
  )
);

create index meeting_attendance_reports_community_idx
  on public.meeting_attendance_reports (community_id, meeting_id);

alter table public.meeting_attendance_reports enable row level security;

create policy "Members see reports for their HIVE"
  on public.meeting_attendance_reports for select to authenticated
  using (exists (
    select 1 from public.community_memberships cm
    where cm.community_id = meeting_attendance_reports.community_id
      and cm.user_id = auth.uid()
  ));

create policy "Admins record member updates for scheduled meetings"
  on public.meeting_attendance_reports for insert to authenticated
  with check (
    public.is_community_admin(community_id)
    and reported_by = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = meeting_id and e.community_id = meeting_attendance_reports.community_id
        and e.event_type = 'meeting' and (e.status is null or e.status = 'scheduled')
    )
    and exists (
      select 1 from public.community_memberships cm
      where cm.community_id = meeting_attendance_reports.community_id
        and cm.user_id = meeting_attendance_reports.user_id
    )
  );

create policy "Admins revise member updates for scheduled meetings"
  on public.meeting_attendance_reports for update to authenticated
  using (public.is_community_admin(community_id))
  with check (
    public.is_community_admin(community_id)
    and reported_by = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = meeting_id and e.community_id = meeting_attendance_reports.community_id
        and e.event_type = 'meeting' and (e.status is null or e.status = 'scheduled')
    )
    and exists (
      select 1 from public.community_memberships cm
      where cm.community_id = meeting_attendance_reports.community_id
        and cm.user_id = meeting_attendance_reports.user_id
    )
  );

create policy "Admins clear member updates"
  on public.meeting_attendance_reports for delete to authenticated
  using (public.is_community_admin(community_id));

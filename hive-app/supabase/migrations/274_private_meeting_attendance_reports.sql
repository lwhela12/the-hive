-- An admin's meeting report can hold a named person's wish or help note.
-- Keep that personal content with its subject, reporter, HIVE admins, and owners.
-- No report rows are changed.
begin;

do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'meeting_attendance_reports') <> 4 or
     not exists (select 1 from pg_policies where schemaname = 'public'
       and tablename = 'meeting_attendance_reports' and cmd = 'SELECT'
       and policyname = 'Members see reports for their HIVE'
       and qual like '%community_memberships%'
       and qual like '%auth.uid()%') or
     not (select c.relrowsecurity from pg_class c join pg_namespace n
       on n.oid = c.relnamespace where n.nspname = 'public'
       and c.relname = 'meeting_attendance_reports') then
    raise exception 'Meeting report access changed; review before restricting it';
  end if;
end;
$$;

drop policy "Members see reports for their HIVE" on public.meeting_attendance_reports;
create policy "Meeting reports stay with subjects and hosts"
  on public.meeting_attendance_reports for select to authenticated
  using (
    user_id = auth.uid() or reported_by = auth.uid()
    or public.is_community_admin(community_id) or public.is_hive_owner()
  );
revoke all on table public.meeting_attendance_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.meeting_attendance_reports
  to authenticated;

commit;

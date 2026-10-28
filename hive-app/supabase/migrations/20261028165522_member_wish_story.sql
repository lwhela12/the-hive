-- Shared meeting reflections are separate from private check-in feedback.
create table public.meeting_member_reflections (
  meeting_id uuid not null references public.events(id),
  user_id uuid not null references public.profiles(id),
  community_id uuid not null references public.communities(id),
  progress text not null default '' check (char_length(progress) <= 5000),
  help_received text not null default '' check (char_length(help_received) <= 5000),
  help_given text not null default '' check (char_length(help_given) <= 5000),
  recorded_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index meeting_member_reflections_community on public.meeting_member_reflections(community_id);
alter table public.meeting_member_reflections enable row level security;
revoke all on public.meeting_member_reflections from anon, authenticated;
grant select, insert, update on public.meeting_member_reflections to authenticated;
grant all on public.meeting_member_reflections to service_role;
create policy story_read on public.meeting_member_reflections for select to authenticated
using (public.is_community_member(community_id));
create policy story_insert on public.meeting_member_reflections for insert to authenticated
with check (
  public.is_community_member(community_id)
  and ((select auth.uid()) = user_id or public.is_community_admin(community_id))
  and recorded_by = (select auth.uid())
  and exists (select 1 from public.events e where e.id = meeting_member_reflections.meeting_id and e.community_id = meeting_member_reflections.community_id and e.event_type = 'meeting')
  and exists (select 1 from public.community_memberships m where m.community_id = meeting_member_reflections.community_id and m.user_id = meeting_member_reflections.user_id)
);
create policy story_update on public.meeting_member_reflections for update to authenticated
using (public.is_community_member(community_id) and ((select auth.uid()) = user_id or public.is_community_admin(community_id)))
with check (
  public.is_community_member(community_id)
  and ((select auth.uid()) = user_id or public.is_community_admin(community_id))
  and recorded_by = (select auth.uid())
  and exists (select 1 from public.events e where e.id = meeting_member_reflections.meeting_id and e.community_id = meeting_member_reflections.community_id and e.event_type = 'meeting')
  and exists (select 1 from public.community_memberships m where m.community_id = meeting_member_reflections.community_id and m.user_id = meeting_member_reflections.user_id)
);
comment on table public.meeting_member_reflections is 'Shared progress and help recalled during a meeting. Never private survey feedback.';

alter publication supabase_realtime add table public.meeting_member_reflections;

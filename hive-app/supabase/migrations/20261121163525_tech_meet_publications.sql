begin;

-- Only the ingestion writer can publish. The member view exposes the
-- Meet-derived text separately from the private Meeting Helper summary.
create table public.tech_meet_publications (
  meeting_id uuid primary key references public.meetings(id) on delete cascade,
  packet_folder_id text not null unique check (packet_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  source_document_id text not null unique check (source_document_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  recap text not null check (length(trim(recap)) between 20 and 4000),
  published_at timestamptz not null default now()
);

alter table public.tech_meet_publications enable row level security;
revoke all on public.tech_meet_publications from public, anon, authenticated, service_role;
grant select, insert, update on public.tech_meet_publications to service_role;

create or replace view public.member_meetings with (security_barrier = true) as
select
  m.id, m.date, m.audio_url, m.transcript_raw, m.transcript_attributed,
  case when public.is_hive_owner() then m.summary
    else public.member_safe_meeting_summary(m.summary) end as summary,
  m.recorded_by, m.processing_status, m.created_at, m.community_id,
  m.assemblyai_transcript_id, m.linked_event_id, m.speaker_names,
  m.archived_at, m.archived_by,
  p.recap as tech_meet_recap,
  p.packet_folder_id as tech_meet_packet_folder_id
from public.meetings m
left join public.tech_meet_publications p on p.meeting_id = m.id
  and exists (select 1 from public.communities c where c.id = m.community_id and c.slug = 'tech')
  and (public.is_hive_owner() or date_trunc('year', m.date::timestamp) =
    date_trunc('year', timezone('America/Los_Angeles', now())))
where m.archived_at is null
  and (public.is_hive_owner() or public.is_community_member(m.community_id));

commit;

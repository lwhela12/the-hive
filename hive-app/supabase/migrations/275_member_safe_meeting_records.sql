-- Full stored summaries are retained for owners. A member-readable projection
-- temporarily withholds every stored recap, because historical prose may
-- paraphrase submitted answers even without a recognizable snapshot key.
-- Historical meeting rows are not rewritten or deleted.
begin;

do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'meetings') <> 3 or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'meetings' and cmd = 'SELECT')
      is distinct from 'ae4e4245e398b403a510eb65073e4df7' or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'meetings' and cmd = 'INSERT')
      is distinct from '28fd5a49643f4efbdb41d3ea379057c5' or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'meetings' and cmd = 'UPDATE')
      is distinct from '4e48834829ee937eec39caec2373245f' or
    (select md5(c.relacl::text) from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'meetings')
      is distinct from '46875263bd6598c4534e2df7d1847a5e' or
    not (select c.relrowsecurity from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'meetings') then
    raise exception 'Meeting record policies changed; review before protecting check-in snapshots';
  end if;
end;
$$;

-- Clive's older meeting cache was made from the original summary. Its expiry
-- only controls chat reuse; it does not stop direct table reads. Preserve all
-- cached rows but exclude the meetings kind from member CRUD, so the historic
-- paraphrases cannot be fetched or moved into another visible cache kind.
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'context_summaries') <> 5 or
    (select md5(c.relacl::text) from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'context_summaries')
      is distinct from 'c1e488b30589fa3c45d7d80fe02ddcad' or
    not has_table_privilege('authenticated', 'public.context_summaries', 'SELECT') or
    not has_table_privilege('authenticated', 'public.context_summaries', 'INSERT') or
    not has_table_privilege('authenticated', 'public.context_summaries', 'UPDATE') or
    not has_table_privilege('authenticated', 'public.context_summaries', 'DELETE') or
    not (select c.relrowsecurity from pg_class c join pg_namespace n
      on n.oid = c.relnamespace where n.nspname = 'public'
      and c.relname = 'context_summaries') or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'context_summaries'
      and cmd = 'ALL')
      is distinct from '0289d5cd9c556546332eb23ef7e32918' or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'context_summaries'
      and cmd = 'SELECT')
      is distinct from 'cb1be70dbf7c054376d07f7ecb4048e9' or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'context_summaries'
      and cmd = 'INSERT')
      is distinct from '8cf0dc19584abedf18e3459c3978d067' or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'context_summaries'
      and cmd = 'UPDATE')
      is distinct from 'ee36a7e8da6caaad4c433cc540eea85a' or
    (select md5(concat_ws('|', schemaname, tablename, policyname, cmd,
      roles::text, qual, with_check)) from pg_policies where
      schemaname = 'public' and tablename = 'context_summaries'
      and cmd = 'DELETE')
      is distinct from 'ba29d44cfaebfbfb6672936a35b461d8' or
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'context_summaries' and cmd = 'ALL'
      and policyname = 'The server can always reach Clive''s memory'
      and roles::text = '{service_role}') or
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'context_summaries' and cmd = 'SELECT'
      and policyname = 'Your own summaries, and your own HIVEs'
      and roles::text = '{authenticated}'
      and qual like '%is_community_member%') or
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'context_summaries' and cmd = 'INSERT'
      and policyname = 'Clive writes summaries where you are'
      and roles::text = '{authenticated}') or
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'context_summaries' and cmd = 'UPDATE'
      and policyname = 'Clive updates summaries where you are'
      and roles::text = '{authenticated}') or
    not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'context_summaries' and cmd = 'DELETE'
      and policyname = 'Clive clears summaries where you are'
      and roles::text = '{authenticated}') then
    raise exception 'Clive cache policies changed; review before protecting historical summaries';
  end if;
end;
$$;

drop policy "Your own summaries, and your own HIVEs" on public.context_summaries;
create policy "Members read non-meeting Clive summaries"
  on public.context_summaries for select to authenticated
  using (
    (summary_type <> 'meetings' and
      case when user_id is not null then user_id = auth.uid()
        else public.is_community_member(community_id) end)
    or (summary_type = 'meetings' and public.is_hive_owner())
  );
drop policy "Clive writes summaries where you are" on public.context_summaries;
create policy "Members write non-meeting Clive summaries"
  on public.context_summaries for insert to authenticated
  with check (summary_type <> 'meetings' and
    case when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id) end);
drop policy "Clive updates summaries where you are" on public.context_summaries;
create policy "Members update non-meeting Clive summaries"
  on public.context_summaries for update to authenticated
  using (summary_type <> 'meetings' and
    case when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id) end)
  with check (summary_type <> 'meetings' and
    case when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id) end);
drop policy "Clive clears summaries where you are" on public.context_summaries;
create policy "Members clear non-meeting Clive summaries"
  on public.context_summaries for delete to authenticated
  using (summary_type <> 'meetings' and
    case when user_id is not null then user_id = auth.uid()
      else public.is_community_member(community_id) end);

create function public.member_safe_meeting_summary(p_summary text)
returns text language sql stable set search_path = '' as $$
  -- Reconciliation received the full private snapshot as model context. Its
  -- narrative and apparently unrelated sections may paraphrase answers, so
  -- no historical generated prose is safe to select by JSON key alone.
  select case when p_summary is not null then
    '{"summary":"This meeting recap is being reviewed for private check-in content.","privacy_redacted":true}'
    else p_summary end;
$$;
revoke all on function public.member_safe_meeting_summary(text)
  from public, anon, authenticated;
grant execute on function public.member_safe_meeting_summary(text)
  to authenticated, service_role;

-- RLS protects the full original row, including model-derived paraphrases and
-- JSON copies nested in rebuild history. Members read a safe projection below.
drop policy "Meetings viewable by members" on public.meetings;
create policy "Full meeting records belong to owners"
  on public.meetings for select to authenticated
  using (
    public.is_hive_owner() or
    (archived_at is null and public.is_community_member(community_id)
      and summary is null)
  );
drop policy "Members can update meetings" on public.meetings;
create policy "Meeting edits cannot replace private source records"
  on public.meetings for update to authenticated
  using (
    public.is_hive_owner() or
    (public.is_community_member(community_id)
      and summary is null)
  )
  with check (
    public.is_hive_owner() or
    (public.is_community_member(community_id)
      and summary is null)
  );

-- RLS does not govern TRUNCATE, TRIGGER, or MAINTAIN. The live ACL granted
-- these to browser roles; retain only the operations used by authenticated UI.
revoke all on table public.meetings from public, anon, authenticated;
grant select, insert, update on table public.meetings to authenticated;

-- Existing security-definer meeting RPCs can bypass RLS. Keep an authenticated
-- admin from changing a retained historical source through one of those paths.
create function public.guard_private_meeting_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.summary is not null and auth.role() = 'authenticated'
      and not public.is_hive_owner() then
    raise exception 'Only a HIVE owner can change this meeting record'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_private_meeting_record()
  from public, anon, authenticated;
create trigger guard_private_meeting_record
  before update on public.meetings for each row
  execute function public.guard_private_meeting_record();

-- This view is owned by the migration role so it can read the base table.
-- Its explicit membership predicate is the row boundary for every caller.
create view public.member_meetings with (security_barrier = true) as
select
  m.id, m.date, m.audio_url, m.transcript_raw, m.transcript_attributed,
  case when public.is_hive_owner() then m.summary
    else public.member_safe_meeting_summary(m.summary) end as summary,
  m.recorded_by, m.processing_status, m.created_at, m.community_id,
  m.assemblyai_transcript_id, m.linked_event_id, m.speaker_names,
  m.archived_at, m.archived_by
from public.meetings m
where m.archived_at is null and
  (public.is_hive_owner() or public.is_community_member(m.community_id));
revoke all on table public.member_meetings from public, anon, authenticated;
grant select on table public.member_meetings to authenticated;

commit;

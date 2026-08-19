-- 189: The Meet transcripts come home.
--
-- Nat and Lucas, 2026-08-19: Tech HIVE meets on Google Meet. Everyone in Tech is
-- remote on their own machine, Meet is free where the in-app video is metered,
-- and the Library pipeline already runs on Meet transcripts. Nat, on the one
-- manual step left: *"let's have an auto import from that, that'd be great."*
--
-- The `import-meet-transcripts` edge function reads Meet's transcript Docs out of
-- Drive and files them onto `meetings`. This table is its memory: one row per
-- document it has ever brought in.
--
-- Where those documents are, checked in the real Drive on 2026-08-19: inside
-- `Default Folder for Meeting Recordings`, one level down in a per-meeting
-- subfolder named `YYYY-MM-DD — <event title>`, alongside the meeting's Outline,
-- Chat, Recording and Notes by Gemini. That folder belongs to
-- natwalstead@gmail.com, so nothing imports until it is shared read-only with
-- the HIVE Google account and that account's token carries drive.readonly. Both
-- prerequisites are written out at the top of the edge function.
--
-- Deliberate choices:
--
--   * **The Drive document id is the key, and it is unique.** A transcript must
--     never be imported twice. Reading the meeting text back and guessing "have
--     I seen these words before?" is not a check — a call that stops and starts
--     produces two documents that overlap, and a meeting held two weeks running
--     produces two that read almost the same. The document id is the only fact
--     that cannot be mistaken for another document.
--
--   * **The receipt is written after the transcript lands.** If the import falls
--     over halfway, no row exists here, and the next run tries the document
--     again. A memory that says "imported" for something that is not anywhere is
--     worse than no memory.
--
--   * **`meeting_id` is `on delete set null`.** Deleting a meeting record does
--     not un-import the document — the receipt survives so the importer still
--     knows not to bring it back. To genuinely re-import something, delete its
--     row here.
--
--   * **`community_id` is `on delete cascade`.** A deleted HIVE's import history
--     is about that HIVE and goes with it.
--
--   * **Only skips are forgotten.** A document the function could not confidently
--     place is not written down at all, so it gets looked at again on every run.
--     Adding the missing meeting to the calendar is enough to make it import
--     itself next time, with nobody re-running anything.
--
--   * **Service-role writes only, owner reads.** This table names documents from
--     several HIVEs at once, and per migration 128 anything that reads across
--     HIVEs asks `is_hive_owner()`, never admin. There is intentionally no
--     insert, update or delete policy: the service key bypasses row-level
--     security and is the only writer this table will ever have.

create table if not exists public.meet_transcript_imports (
  id uuid primary key default gen_random_uuid(),
  -- Google Drive's id for the transcript document. The whole point of the table.
  document_id text not null unique,
  -- What the document was called, kept so a person can find it again in Drive.
  document_name text,
  -- Drive's own link to it, for the same reason.
  document_url text,
  -- When Google created the document.
  document_created_at timestamptz,
  -- Which HIVE it was filed into.
  community_id uuid not null references public.communities(id) on delete cascade,
  -- The meetings row it landed on.
  meeting_id uuid references public.meetings(id) on delete set null,
  -- The date that meetings row carries, as YYYY-MM-DD.
  meeting_date date,
  -- Which signal decided the HIVE, in plain words: 'the document name',
  -- 'a scheduled meeting with the same name', or 'named by an owner'. Written so
  -- a wrong filing can be traced back to the rule that made it.
  matched_by text,
  -- How much text came across, for spotting a transcript that arrived empty.
  character_count integer,
  imported_at timestamptz not null default now()
);

comment on table public.meet_transcript_imports is
  'One row per Google Meet transcript document brought into HIVE. The document id is unique, which is what stops the same transcript being imported twice. Written by the service role from the import-meet-transcripts edge function; read by owners.';
comment on column public.meet_transcript_imports.document_id is
  'Google Drive''s id for the transcript Doc. Unique on purpose — this is the only fact that reliably tells two transcripts apart.';
comment on column public.meet_transcript_imports.matched_by is
  'Which signal decided the HIVE. The date alone is never a signal: Nat is on Meet all week for work that is not a HIVE, so "only one HIVE met that day" would file a client call into a community. Nor is a bare HIVE word — the newest transcript in the real Drive is "Le Mis Tech Podcast Call", which is Kelly''s podcast and not Tech HIVE, so a name only counts when the HIVE''s word sits next to the word HIVE.';

-- The two questions asked of this table: "have I seen this document?" (the
-- unique constraint already indexes that) and "what has come into this HIVE
-- lately?".
create index if not exists meet_transcript_imports_hive_idx
  on public.meet_transcript_imports (community_id, imported_at desc);

alter table public.meet_transcript_imports enable row level security;

grant select on public.meet_transcript_imports to authenticated;

drop policy if exists "Owners can read Meet transcript imports" on public.meet_transcript_imports;
create policy "Owners can read Meet transcript imports"
  on public.meet_transcript_imports
  for select
  to authenticated
  using (public.is_hive_owner());

-- 175: Clive keeps receipts.
--
-- Nat's parked item: "Measure Clive's cost per HIVE before anybody is ever
-- charged — two jobs run unattended nightly and bill with nobody watching."
-- This is the prerequisite for any future "start your own HIVE for $X/month"
-- pricing: before quoting a price, know what a HIVE costs.
--
-- One row per Anthropic API call, written fire-and-forget by the edge
-- functions (chat, generate-title, distil-answers, seal-meeting,
-- draft-newsletter, apply-meeting-notes, transcribe) via
-- functions/_shared/metering.ts.
--
-- Deliberate choices:
--   * TOKENS ONLY, NO PRICES. Model prices change (Sonnet 5 already changed
--     its own launch pricing); tokens are the durable fact. Cost is computed
--     at query time by joining today's price list in the query itself.
--   * community_id is NULLABLE. distil-answers batches answers from every
--     HIVE into one model call, so that call belongs to no single HIVE.
--     `on delete set null` keeps the spend history even if a HIVE is ever
--     deleted — the bill was still paid.
--   * Service-role writes only. No insert/update/delete policy exists for
--     any authenticated role, so members can neither forge nor tamper with
--     usage rows; the service key bypasses RLS and is the only writer.
--   * Owner-only reads. This table reads across HIVEs, and per migration 128
--     anything that crosses HIVEs asks is_hive_owner(), never admin.

create table public.assistant_usage (
  id uuid primary key default gen_random_uuid(),
  -- Which HIVE the call was made for; null when the call had no single HIVE.
  community_id uuid references public.communities(id) on delete set null,
  -- Which edge function made the call: 'chat', 'distil-answers', ...
  function_name text not null,
  -- The model string as requested ('claude-haiku-4-5', 'claude-sonnet-5').
  model text not null,
  -- Straight off the Anthropic response's `usage` object.
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.assistant_usage is
  'One row per Anthropic API call made by an edge function. Tokens only — prices change, so cost is computed at query time. Written by the service role via _shared/metering.ts; read by owners.';
comment on column public.assistant_usage.community_id is
  'The HIVE the call was for. Null when one call spans every HIVE (distil-answers batches).';

-- The question this table answers is "tokens by model by HIVE by month".
create index assistant_usage_hive_month_idx
  on public.assistant_usage (community_id, created_at);
create index assistant_usage_created_at_idx
  on public.assistant_usage (created_at);

alter table public.assistant_usage enable row level security;

-- Owners read; nobody else does anything. There is intentionally no policy
-- for insert/update/delete — the service role bypasses RLS, and it is the
-- only writer this table will ever have.
grant select on public.assistant_usage to authenticated;

create policy "Owners can read assistant usage"
  on public.assistant_usage
  for select
  to authenticated
  using (public.is_hive_owner());

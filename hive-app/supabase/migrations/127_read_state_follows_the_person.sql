-- What you've already seen follows you between devices
--
-- Read state has been living in localStorage, which means it belongs to a
-- browser rather than to a person. Nat marks things read on her laptop, opens
-- her phone, and everything is unread again — and the "N new things since you
-- were last in" banner introduces itself afresh on every device
-- (Nat 2026-08-02).
--
-- It belongs on the profile. Two columns rather than a table: both are small,
-- both are read once when the app opens, and neither is worth a join.

alter table public.profiles
  add column if not exists app_news_seen_id text,
  add column if not exists activity_read_ids jsonb not null default '{}'::jsonb;

comment on column public.profiles.app_news_seen_id is
  'The newest what''s-new entry this person has seen. Replaces a per-browser localStorage key so the banner stops reintroducing itself on each device.';

comment on column public.profiles.activity_read_ids is
  'Which activity items this person has read, keyed by community id: {"<community_id>": ["item-id", ...]}. Kept trimmed by the app — it only ever needs to cover what the feed still shows.';

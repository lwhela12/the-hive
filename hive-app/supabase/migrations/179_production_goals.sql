-- Production HIVE's MVP piece, bumped up from later-phase by Nat in a voice
-- memo (2026-08-13): "get clear on what your production goals are... maybe
-- it lives in your profile, where we have the three MIQs... then it reveals
-- the mind map for everybody." The mind-map visualization is explicitly
-- later phase in her own words; this migration is the piece she asked to
-- start now — one written goal per person, per HIVE.
--
-- Lives on the membership row, not `profiles`, for the same reason `role`
-- does: a person can belong to more than one HIVE, and this is Production
-- HIVE's question, not something that should bleed onto their OG or Tech
-- identity. The column name stays generic (not `production_goal`) so any
-- future HIVE with its own singular focus can use the same seat without a
-- second migration.

alter table public.community_memberships
  add column if not exists hive_goal text;

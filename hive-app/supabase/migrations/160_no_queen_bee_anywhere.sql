-- Queen Bee is retired — dissolved April 2026, replaced by Hummdinger sessions.
-- 2026-08-09's session removed every application-layer reference (Clive's
-- context builder, types, notification types). Nat, same day, on the tables
-- themselves: "we dont want any queen bee anything anywhere... not from our
-- history, but from our current playbooks." The four queen_bees rows and two
-- monthly_highlights rows were pulled and written into a HIVE receipt before
-- this ran, so the history survives outside the live schema — just not as
-- something the app can query or resurface.
--
-- Drop order follows the foreign keys: monthly_highlights and
-- queen_bee_updates both reference queen_bees, so they go first. events had
-- a related_queen_bee_id column with zero rows actually using it (checked
-- live before writing this) — dropped rather than left as a column that
-- points at a table that no longer exists.

drop table if exists monthly_highlights;
drop table if exists queen_bee_updates;
alter table events drop column if exists related_queen_bee_id;
drop table if exists queen_bees;

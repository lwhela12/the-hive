-- The public site can find out which HIVEs exist, and nothing else about them.
--
-- Nat, 2026-08-14, on rewriting the-hive.app for more than one HIVE: *"don't
-- reword it for three, just reword it for multiple, that way we don't have to
-- keep going and adding it every time we make a change."* The site had a
-- hardcoded list of two HIVEs in two separate files; it asks now instead.
--
-- **Why a view rather than a policy on `communities`.** The obvious move is an
-- anon SELECT policy on the table. It would also have published
-- `meeting_helper_notes` — the notes Nat types live during a meeting, on the
-- treasurer slide and under the four questions — along with `slide_deck_url`
-- and every HIVE's honey-pot and cadence settings. RLS grants a whole row, and
-- three of those columns are nobody's business. A view is the only shape that
-- gives away exactly the three fields that are already public: a HIVE's name
-- and colour appear on this very site, in The Buzz, and on every invite email.
create or replace view public.public_hives as
  select slug, name, accent_color
  from public.communities
  order by created_at asc;

comment on view public.public_hives is
  'Slug, display name and accent colour of every HIVE. Read by the-hive.app so a new HIVE needs no code. Deliberately excludes meeting_helper_notes, slide_deck_url, honey_pot_enabled and meeting_cadence.';

-- The view runs with its owner''s rights, which is what lets an anonymous
-- reader past the table''s row-level security — and why the column list above
-- is the whole of the security boundary. Keep it that way.
grant select on public.public_hives to anon, authenticated;

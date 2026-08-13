-- A granted wish stopped being readable by anyone but its own owner the
-- moment it was granted (Nat, 2026-08-13: her quarterly recap listed only
-- HER FOUR granted wishes, silently dropping Brittany's, Oliver's and
-- Sara's — same HIVE, same quarter, same "granted" status).
--
-- The existing SELECT policy ("Wishes viewable by scope") only opens a wish
-- to the community when status = 'public'. Granting flips status to
-- 'fulfilled', which the policy never mentions — so a wish's whole
-- afterlife, the "look what we did together" part, was invisible to
-- everyone except the person who asked for it. That's backwards: a granted
-- wish is the community's shared win, not a private record.
--
-- This adds a second SELECT policy, same scope shape as the public one
-- (member of the HIVE, or share_scope reaches beyond it), for
-- status = 'fulfilled'.

create policy "Fulfilled wishes viewable by scope"
  on public.wishes for select
  using (
    status = 'fulfilled'
    and (
      is_community_member(community_id)
      or (
        share_scope = any (array['all_hives', 'public'])
        and community_shares_beyond_hive(community_id)
        and is_any_community_member()
      )
    )
  );

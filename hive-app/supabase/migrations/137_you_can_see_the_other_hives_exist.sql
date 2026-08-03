-- You can see that the other HIVEs exist. You still can't see inside them.
--
-- Nat, 2026-08-03, evolving her own position out loud: "it's nice to know what
-- other hives are up to... globally, it would be cool to see what other hives
-- are scheduling and doing. And maybe you think 'oh that's cool, I'm going to do
-- that too'."
--
-- Until now a member could only see the HIVEs they belonged to, so HIVE-Wide
-- showed them one line where Nat sees three, and the whole idea of a shared high
-- street was invisible to everybody except the people in every HIVE.
--
-- WHAT THIS OPENS: a HIVE's name, its colour, and the fact that it is there.
-- WHAT IT DOES NOT: anything inside one. Boards, wishes, events, members,
-- messages and check-ins are each gated separately, by their own policies and by
-- the HIVE's ceiling (migrations 124/125). A Production HIVE event is still
-- invisible to an OG HIVE member unless somebody shared it. All this changes is
-- that "Production HIVE — tbd" can appear at all, instead of the HIVE seeming
-- not to exist.
--
-- Worth being plain about the tradeoff, because it IS one: everybody in any HIVE
-- can now learn the names of all the others. Nat's call, made knowingly. The
-- roster stays private — who is IN a HIVE is a separate question, answered by
-- profiles.profile_scope, one person at a time (migration 135).

-- The live policy is "Communities viewable by members or invitees". Dropping by
-- the RIGHT name matters: migration 124 dropped a survey policy by a name that
-- had never existed, the drop failed silently, and the fence it replaced sat
-- there doing nothing for two days. Checked against pg_policies before writing.
drop policy if exists "Communities viewable by members or invitees" on public.communities;

create policy "Every HIVE knows the others exist"
  on public.communities for select
  using (
    public.is_any_community_member()
    or public.is_genesis_state()
    or public.has_pending_invite(id)
  );

comment on table public.communities is
  'The HIVEs. Any member of any HIVE can see that the others exist, with their names and colours — the contents of each are gated separately by every other table''s own policies and by max_share_scope.';

-- Who owns the HIVE Help focus, and who owns having done it
--
-- Migration 130 let a member publish a helper_log POST outward, on the grounds
-- that migration 119 said a focus goes public because a member said so. Nat
-- settled the shape properly on 2026-08-03 and it isn't that:
--
--   "There's only one main HELP focus per month, decided by the OG HIVE, and
--    that populates to all things. But each individual member gets to decide if
--    their contribution to HIVE help is public info or not."
--
-- So the two halves belong to two different people:
--
--   the FOCUS         one a month, chosen in OG HIVE, announced to the others.
--                     It speaks for the HIVEs, so it is the owner's, like the
--                     newsletter. A member publishing their own focus outward
--                     was the old one-HIVE assumption still standing up.
--
--   your CONTRIBUTION what you actually did — donated, called a friend, picked
--                     up litter, let someone into traffic. That is yours, and
--                     you say at the end of the month whether it travels. It is
--                     a REPLY, and replies got their own share_scope in
--                     migration 129, so the mechanism is already there.
--
-- This removes the post-level exception. Nothing is taken away from anybody:
-- what a member could express through it, they now express on their own reply,
-- which is the thing that was actually theirs all along.

create or replace function public.guard_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.visibility is not distinct from old.visibility then
    return new;
  end if;

  if new.visibility is distinct from 'public' then
    return new;
  end if;

  -- Server-side work (migrations, edge functions holding the service key) has
  -- no signed-in person to ask about. That key is already total power.
  if auth.uid() is null or public.is_hive_owner() then
    return new;
  end if;

  raise exception 'Publishing outward is the HIVE owner''s. Your own contribution is yours — mark that public instead.'
    using errcode = '42501';
end;
$$;

comment on function public.guard_post_visibility is
  'A post that leaves the HIVE speaks for the HIVE, so only an owner may send one. What a member did about it is a reply, and board_replies.share_scope is theirs.';

-- The other half of the rule, so a member can only speak for themselves: your
-- reply's reach is yours to set, and nobody else's to set for you. The existing
-- UPDATE policy already limits edits to your own replies; this makes the same
-- true of share_scope specifically, including for admins, who have no business
-- deciding on somebody's behalf that their good deed is public.

create or replace function public.guard_reply_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.share_scope is not distinct from old.share_scope then
    return new;
  end if;

  if auth.uid() is null or new.author_id = auth.uid() then
    return new;
  end if;

  raise exception 'Only the person who wrote it decides how far it travels.'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_reply_scope on public.board_replies;
create trigger guard_reply_scope
  before insert or update on public.board_replies
  for each row execute function public.guard_reply_scope();

-- Left deliberately undone, because it is Nat's design rather than a hole:
-- the focus is still one helper_log post per HIVE, so there are three of them
-- and nothing announces OG HIVE's choice to the other two. One focus a month
-- that populates everywhere needs a place of its own to live; that is the
-- monthly-theme work, not this migration.

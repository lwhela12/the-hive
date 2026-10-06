-- The Buzz has one finished-issue shelf, wherever somebody reads it.
--
-- The signed-in app already knows that an issue is finished when it was sent,
-- deliberately published, or imported before the send ledger existed. The
-- public archive was still applying the narrower visibility='public' rule,
-- which hid real past issues. Mirror the app's completion rule here.
--
-- Owner authorship is required for the legacy branch. That keeps an old
-- members-only contribution from becoming public merely because it predates
-- the send button; only Nat's finished editorial issues cross this view.
create or replace view public.public_newsletters as
select bp.id, bp.title, bp.content, bp.created_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
join public.communities c on c.id = bp.community_id
join public.profiles author on author.id = bp.author_id
where bc.topic_kind = 'newsletter'
  and c.max_share_scope = 'public'
  and c.publicly_listed = true
  and coalesce(author.is_owner, false) = true
  and bp.archived_at is null
  and coalesce(bp.status, 'active') <> 'archived'
  and (
    bp.visibility = 'public'
    or exists (
      select 1
      from public.newsletter_sends ns
      where ns.post_id = bp.id
        and ns.mode = 'live'
    )
    -- First issue created for the real in-app send path. Older issues were
    -- imported as completed history and have no newsletter_sends rows.
    or bp.created_at <= timestamptz '2026-08-12T18:03:25.000Z'
  )
order by bp.created_at desc;

alter view public.public_newsletters set (security_invoker = false);
revoke all on public.public_newsletters from public, anon, authenticated;
grant select on public.public_newsletters to anon, authenticated;
comment on view public.public_newsletters is
  'The owner-reviewed finished Buzz archive: published, live-sent, and pre-send-ledger imported issues. Mirrors the signed-in Buzz shelf.';

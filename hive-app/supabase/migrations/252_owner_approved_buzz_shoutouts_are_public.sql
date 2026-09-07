-- The Buzz is an owner-reviewed editorial letter. End-of-month answers are
-- intentionally collected as voluntary shout-outs, so a finished Buzz may
-- publish those names and make their in-app mention real. This exception is
-- only for owner-authored newsletter posts; member board posts remain private.
create or replace function public.guard_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_ceiling text;
  v_author_is_owner boolean;
begin
  if new.visibility is distinct from 'public' then
    return new;
  end if;

  select bc.topic_kind, c.max_share_scope
    into v_kind, v_ceiling
  from public.board_categories bc
  join public.communities c on c.id = new.community_id
  where bc.id = new.category_id and bc.community_id = new.community_id;

  if v_kind not in ('newsletter', 'helper_log') or v_ceiling is distinct from 'public' then
    raise exception 'Public publication uses the owner-reviewed newsletter or invitation path.'
      using errcode = '42501';
  end if;

  select coalesce(p.is_owner, false) into v_author_is_owner
  from public.profiles p where p.id = new.author_id;

  if not coalesce(v_author_is_owner, false)
     or (auth.uid() is not null and not public.is_hive_owner()) then
    raise exception 'Public publication is reviewed by the HIVE owner.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace view public.public_newsletters as
select bp.id, bp.title, bp.content, bp.created_at
from public.board_posts bp
join public.board_categories bc on bc.id = bp.category_id
join public.communities c on c.id = bp.community_id
where bc.topic_kind = 'newsletter'
  and bp.visibility = 'public'
  and c.max_share_scope = 'public'
  and c.publicly_listed = true
  and coalesce(bp.status, 'active') <> 'archived'
order by bp.created_at desc;

alter view public.public_newsletters set (security_invoker = false);
revoke all on public.public_newsletters from public, anon, authenticated;
grant select on public.public_newsletters to anon, authenticated;

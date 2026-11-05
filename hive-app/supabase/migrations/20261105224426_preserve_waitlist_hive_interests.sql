-- One person may ask about Legacy/OG (default) AND Tech. Keep one row per
-- email so /join and existing owners' status handling retain their meaning.
-- Apply transactionally before releasing the admin reader that selects this
-- column. No rows are deleted, and no grants or RLS policies are changed.
set local lock_timeout = '5s';

alter table public.waitlist
  add column if not exists interest_slugs text[] not null default '{}';

-- Preserve the interest still present in every legacy row. Interests already
-- overwritten before this migration cannot be reconstructed from that row.
update public.waitlist
set interest_slugs = array(
  select distinct slug
  from unnest(interest_slugs || array[interested_in]) as interests(slug)
  where slug is not null
  order by slug
)
where interested_in is not null
  and not (interest_slugs @> array[interested_in]);

comment on column public.waitlist.interest_slugs is
  'All explicitly requested HIVE slugs, deduplicated. Empty means any / not sure. interested_in remains the latest slug for older readers.';

-- Same public write-only RPC, signature, validator, security context, and
-- existing execute ACL. The unique-email upsert locks the row and unions the
-- interests in that same statement, including simultaneous signup requests.
create or replace function public.join_waitlist(
  p_email text,
  p_name text default null,
  p_message text default null,
  p_interested_in text default null,
  p_source text default 'public-site'
)
returns void as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
  clean_message text := nullif(trim(coalesce(p_message, '')), '');
  clean_interest text := nullif(trim(coalesce(p_interested_in, '')), '');
  clean_source text := nullif(trim(coalesce(p_source, '')), '');
begin
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(clean_email) > 254 then
    raise exception 'invalid email';
  end if;

  insert into public.waitlist (email, name, message, interested_in, interest_slugs, source)
  values (
    clean_email, clean_name, clean_message, clean_interest,
    case when clean_interest is null then '{}'::text[] else array[clean_interest] end,
    coalesce(clean_source, 'public-site')
  )
  on conflict (email) do update
    set name = coalesce(excluded.name, public.waitlist.name),
        message = coalesce(excluded.message, public.waitlist.message),
        interested_in = coalesce(excluded.interested_in, public.waitlist.interested_in),
        interest_slugs = array(
          select distinct slug
          from unnest(public.waitlist.interest_slugs || excluded.interest_slugs
            || array[public.waitlist.interested_in]) as interests(slug)
          where slug is not null
          order by slug
        ),
        status = case when public.waitlist.status = 'passed' then 'passed' else 'new' end;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';

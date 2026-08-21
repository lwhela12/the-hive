-- The HIVE-Wide calendar shows the whole window, not only the start.
--
-- `hive_wide_meeting_days` is deliberately narrow — day, time, title, whose —
-- because it reaches across HIVEs and a wide function is a wide door. Meetings
-- gained an `end_time` in migration 202, so the one extra column joins the
-- same short list. It is no more revealing than the start time already sitting
-- beside it: both say when to be somewhere, and the title rule above is what
-- actually decides whether a stranger's HIVE says anything at all.

drop function if exists public.hive_wide_meeting_days(date, date);

create function public.hive_wide_meeting_days(from_date date, to_date date)
returns table (
  id uuid,
  title text,
  event_date date,
  event_time time without time zone,
  end_time time without time zone,
  community_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    e.id,
    case
      -- your own HIVE's titles you could already read; a sharing HIVE's titles
      -- travel; a stay-home HIVE keeps its words and sends only the bee.
      when is_community_member(e.community_id) then e.title
      when community_shares_beyond_hive(e.community_id) then e.title
      else null
    end as title,
    e.event_date,
    e.event_time,
    e.end_time,
    e.community_id
  from public.events e
  where e.event_type = 'meeting'
    -- scheduled and completed both belong on a calendar you can walk backwards
    -- through. Anything else (a cancellation, a status not invented yet) stays
    -- home — the safe end is always the one that travels least.
    and coalesce(e.status, 'scheduled') in ('scheduled', 'completed')
    and e.event_date >= from_date
    and e.event_date <= to_date
    -- you have to be standing somewhere in HIVE before you can see the street.
    and is_any_community_member()
  order by e.event_date, e.event_time nulls last;
$$;

-- Nat requested skipping the spending walkthrough for the October 28 meeting.
-- Keep the deck intact for other meetings and preserve all existing notes.
update public.communities c
set meeting_helper_notes = jsonb_set(coalesce(c.meeting_helper_notes, '{}'::jsonb), '{meetingAgendaOmissions}',
  coalesce(c.meeting_helper_notes->'meetingAgendaOmissions', '{}'::jsonb) || jsonb_build_object(e.id::text, jsonb_build_array('spend')))
from public.events e
where c.slug = 'default' and e.community_id = c.id
  and e.event_type = 'meeting' and e.status = 'scheduled' and e.event_date = '2026-10-28';

insert into public.app_news(occurred_on, title, detail, created_by)
select '2026-10-28', 'Find the HIVE clothing studio in OG HIVE News from Nat',
  'Open the studio from News from Nat or the “It’s hoodie season!!” board discussion. Tonight’s agenda skips the spending walkthrough.', id
from public.profiles where lower(email) = 'natwalstead@gmail.com';

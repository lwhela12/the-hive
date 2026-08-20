-- Production HIVE's September 10 meeting is scheduled from 5:00 to 7:00 PM.
-- Its saved official meeting end still held the 5:00 PM wall from the first
-- Production meeting, so the Meeting Helper would begin at (or past) zero.
-- This HIVE-level setting is the countdown target; it is not a member answer.
update public.communities
set meeting_hard_out = '19:00'
where slug = 'show'
  and meeting_hard_out is distinct from '19:00';

-- Every HIVE asks the same optional personal-availability question before a
-- meeting. OG already carries q_hard_out, so keep its id and answers while
-- standardizing the plain-language wording. Tech and Production receive that
-- same answer key without replacing any question or touching any response.
-- OG and Tech reuse these standing monthly survey rows each cycle; Production
-- also carries this definition in lib/checkIns.ts for future occurrences.
with pre_meeting_surveys as (
  select survey.id, survey.questions
  from public.surveys as survey
  join public.communities as community on community.id = survey.community_id
  where survey.is_active is true
    and (
      (community.slug in ('default', 'tech') and survey.title ~* 'monthly[[:space:]]+check-?in')
      or (community.slug = 'show' and survey.title = 'Before we meet')
    )
),
normalized_questions as (
  select
    pre_meeting.id,
    jsonb_agg(
      case
        when question.value ->> 'id' = 'q_hard_out' then
          question.value || jsonb_build_object(
            'text', 'Do you have a hard out? If so, what time?',
            'type', 'short',
            'required', false
          )
        else question.value
      end
      order by question.ordinality
    ) || case
      when bool_or(question.value ->> 'id' = 'q_hard_out') then '[]'::jsonb
      else jsonb_build_array(
        jsonb_build_object(
          'id', 'q_hard_out',
          'text', 'Do you have a hard out? If so, what time?',
          'type', 'short',
          'required', false
        )
      )
    end as questions
  from pre_meeting_surveys as pre_meeting
  cross join lateral jsonb_array_elements(coalesce(pre_meeting.questions, '[]'::jsonb))
    with ordinality as question(value, ordinality)
  group by pre_meeting.id
)
update public.surveys as survey
set questions = normalized.questions
from normalized_questions as normalized
where survey.id = normalized.id
  and survey.questions is distinct from normalized.questions;

comment on column public.communities.meeting_hard_out is
  'This HIVE''s official meeting end (HH:MM), used by the Meeting Helper countdown. A member''s personal leaving time is stored separately as the q_hard_out survey answer.';

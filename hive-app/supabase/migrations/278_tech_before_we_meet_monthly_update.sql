-- Tech HIVE's recurring meeting check-in asks what members are doing and
-- how the past month felt, whether or not they can join the call. Keep the
-- question IDs stable so existing answers and Meeting Helper continue to read.
-- This inactive survey row supplies questions to the merged Before we meet.

begin;

update public.surveys s
set title = 'Tech HIVE · Before we meet',
    description = 'Share what you are working on, a tech high and low from this month, and where this HIVE could help.'
where s.id = 'af188fb1-54b7-4ecc-b445-c8096f15cf1a'
  and s.title = 'Monthly Check-in: POP + Learned'
  and exists (select 1 from public.communities c where c.id = s.community_id and c.slug = 'tech');

update public.surveys s
set questions = jsonb_insert(s.questions, '{5}',
  '{"id":"q_tech_working_on","text":"What are you building, learning, or working on in tech right now?","type":"long","required":false}'::jsonb)
where s.id = 'af188fb1-54b7-4ecc-b445-c8096f15cf1a'
  and exists (select 1 from public.communities c where c.id = s.community_id and c.slug = 'tech')
  and not s.questions @> '[{"id":"q_tech_working_on"}]'::jsonb;

update public.surveys s
set questions = jsonb_insert(s.questions, '{7}',
  '{"id":"q_tech_low","text":"What was a tech low this past month? A snag, frustration, or something that did not work.","type":"long","required":false}'::jsonb)
where s.id = 'af188fb1-54b7-4ecc-b445-c8096f15cf1a'
  and exists (select 1 from public.communities c where c.id = s.community_id and c.slug = 'tech')
  and not s.questions @> '[{"id":"q_tech_low"}]'::jsonb;

update public.surveys s
set questions = (
  select jsonb_agg(
    case when item.value->>'id' = 'q_learned'
      then jsonb_set(item.value, '{text}', to_jsonb('What was a tech high this past month? A win, useful tool, or something you learned.'::text))
      else item.value end
    order by item.ordinality)
  from jsonb_array_elements(s.questions) with ordinality item(value, ordinality)
)
where s.id = 'af188fb1-54b7-4ecc-b445-c8096f15cf1a'
  and exists (select 1 from public.communities c where c.id = s.community_id and c.slug = 'tech')
  and exists (
    select 1 from jsonb_array_elements(s.questions) question
    where question->>'id' = 'q_learned'
      and question->>'text' = 'What did you learn this month that somebody else here should know? (This feeds the Things We Learned board.)'
  );

commit;

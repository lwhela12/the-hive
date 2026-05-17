-- Seed the standing pre-meeting culture check-in survey
-- This survey is meant to be filled out before each HIVE gathering so Clive has full context

-- NOTE: Replace 'YOUR_COMMUNITY_ID' with the actual community UUID before running,
-- or run this after seeding the community row.

-- We use a DO block so we can reference the community dynamically
DO $$
DECLARE
  v_community_id uuid;
BEGIN
  -- Get the first (and typically only) community
  SELECT id INTO v_community_id FROM public.communities ORDER BY created_at LIMIT 1;

  IF v_community_id IS NULL THEN
    RAISE NOTICE 'No community found — skipping culture survey seed.';
    RETURN;
  END IF;

  -- Only insert if this survey doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM public.surveys
    WHERE community_id = v_community_id
      AND title = 'Pre-Meeting Elevator Pitch'
  ) THEN
    INSERT INTO public.surveys (
      community_id,
      title,
      description,
      questions,
      is_active
    ) VALUES (
      v_community_id,
      'Pre-Meeting Elevator Pitch',
      'A quick check-in so HIVE (and Clive) know where everyone''s at before we gather. Takes about 2 minutes.',
      '[
        {
          "id": "q_name_today",
          "text": "What do you want to be called today?",
          "type": "short",
          "required": false
        },
        {
          "id": "q_job",
          "text": "What is your job / what have you been doing for work lately?",
          "type": "short",
          "required": false
        },
        {
          "id": "q_working_on",
          "text": "What have you been working on lately — personally or professionally?",
          "type": "long",
          "required": false
        },
        {
          "id": "q_health",
          "text": "How is your health?",
          "type": "long",
          "required": false
        },
        {
          "id": "q_inner_circle",
          "text": "How is your inner circle''s health — family, close friends, partner?",
          "type": "long",
          "required": false
        },
        {
          "id": "q_obsessed_with",
          "text": "What have you been obsessed with lately?",
          "type": "long",
          "required": false
        },
        {
          "id": "q_energy",
          "text": "What is your energy level coming into this meeting?",
          "type": "scale",
          "required": false
        },
        {
          "id": "q_bring_to_meeting",
          "text": "Is there anything specific you''re hoping to get out of today''s gathering?",
          "type": "long",
          "required": false
        }
      ]'::jsonb,
      true
    );

    RAISE NOTICE 'Culture survey seeded for community %', v_community_id;
  ELSE
    RAISE NOTICE 'Culture survey already exists — skipping.';
  END IF;
END $$;

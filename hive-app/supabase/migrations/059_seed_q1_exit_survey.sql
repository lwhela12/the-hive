-- Q1 Exit Survey + Culture Code check-in
-- Combines quarterly feedback with leadership/culture questions from Nat

DO $$
DECLARE
  v_community_id uuid;
BEGIN
  SELECT id INTO v_community_id FROM public.communities ORDER BY created_at LIMIT 1;

  IF v_community_id IS NULL THEN
    RAISE NOTICE 'No community found — skipping Q1 survey seed.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.surveys
    WHERE community_id = v_community_id
      AND title = 'HIVE Q1 Exit Survey'
  ) THEN
    INSERT INTO public.surveys (
      community_id,
      title,
      description,
      questions,
      is_active
    ) VALUES (
      v_community_id,
      'HIVE Q1 Exit Survey',
      'Your honest feedback helps us make HIVE better for everyone. Takes about 5–8 minutes. Note: responses are visible to admins but won''t be shared publicly without your permission.',
      '[
        {
          "id": "s1_overall_rating",
          "text": "How would you rate your overall experience in HIVE this quarter?",
          "type": "choice",
          "options": [
            "1 — Not what I expected",
            "2 — Below expectations",
            "3 — Met expectations",
            "4 — Above expectations",
            "5 — Exceeded expectations"
          ],
          "required": false
        },
        {
          "id": "s1_value_scale",
          "text": "Are you getting good value from your membership? Think about your time, energy, and what you''re getting back — connections, accountability, tangible help on your projects. (1 = not at all, 5 = absolutely)",
          "type": "choice",
          "options": ["1 — Not at all", "2 — Somewhat", "3 — Pretty good", "4 — Yes, definitely", "5 — More than I expected"],
          "required": false
        },
        {
          "id": "s1_more_value",
          "text": "What''s one thing you could do — or that HIVE could do differently — to help you get more out of it?",
          "type": "long",
          "required": false
        },
        {
          "id": "s2_working_well",
          "text": "What''s working really well that you''d want to keep?",
          "type": "long",
          "required": false
        },
        {
          "id": "s2_could_be_better",
          "text": "What''s working okay but could be better?",
          "type": "long",
          "required": false
        },
        {
          "id": "s2_not_working",
          "text": "What''s not working at all and should change or be dropped?",
          "type": "long",
          "required": false
        },
        {
          "id": "s2_project_types",
          "text": "What types of group projects or focus areas feel most valuable? (e.g. creative projects, business strategy, personal goals, community giving — no wrong answers)",
          "type": "long",
          "required": false
        },
        {
          "id": "s3_meeting_format",
          "text": "How do you feel about the current meeting format and flow? Anything feel too long, too rushed, or out of order?",
          "type": "long",
          "required": false
        },
        {
          "id": "s3_cadence",
          "text": "Does the current meeting cadence and time commitment feel sustainable?",
          "type": "choice",
          "options": ["Yes", "No", "It depends"],
          "required": false
        },
        {
          "id": "s3_q1_review_format",
          "text": "For our Q1 review at the next meeting — would you prefer to discuss as a group, or handle it through a survey so we can use meeting time for decisions only?",
          "type": "choice",
          "options": ["Discuss as a group", "Survey first, decisions in person", "Either works for me"],
          "required": false
        },
        {
          "id": "s4_group_size",
          "text": "How do you feel about the current group size of 12? (A larger group would reduce the individual ''spotlight tax'' but could change the intimacy and chemistry.)",
          "type": "choice",
          "options": ["Keep at 12", "Grow the group", "Not sure"],
          "required": false
        },
        {
          "id": "s4_keep_fresh",
          "text": "What are your ideas for keeping HIVE feeling fresh, energizing, and not like another obligation? We want to grow — not grind.",
          "type": "long",
          "required": false
        },
        {
          "id": "s5_roles",
          "text": "How do you feel about the current leadership roles (Founder/Apiarist, Historian, Treasurer, Scrum Master)? Are roles clear? Is the workload fair? Is anything missing?",
          "type": "long",
          "required": false
        },
        {
          "id": "s5_historian_events",
          "text": "The Historian currently handles event announcements and app updates. Does that feel like the right home for it?",
          "type": "choice",
          "options": ["Yes, keep with Historian", "Shared responsibility", "Other — I''ll explain in the open field below"],
          "required": false
        },
        {
          "id": "s6_notifications",
          "text": "What notification level would you prefer? Think about what actually keeps you engaged vs. what makes you mute everything.",
          "type": "choice",
          "options": ["Only tags + replies to my posts", "All new board posts", "Custom — I''ll explain below"],
          "required": false
        },
        {
          "id": "s6_app_feedback",
          "text": "Any features or changes you''d like to see in the app? (e.g. surfacing newest posts at top, active to-do list, easier search, something else entirely)",
          "type": "long",
          "required": false
        },
        {
          "id": "s8_connection",
          "text": "Do you feel genuinely connected to the other members of HIVE?",
          "type": "choice",
          "options": ["1 — Not really", "2 — A little", "3 — Somewhat", "4 — Pretty connected", "5 — Very connected"],
          "required": false
        },
        {
          "id": "s8_comms_norms",
          "text": "What communication norms would help HIVE feel more alive between meetings? Think about what would work for you: quick wins, voice notes, a monthly check-in prompt, etc.",
          "type": "long",
          "required": false
        },
        {
          "id": "culture_go_stop_continue",
          "text": "What''s your personal go / stop / continue for HIVE this quarter? (Go = start doing this. Stop = drop this. Continue = keep doing this.)",
          "type": "long",
          "required": false
        },
        {
          "id": "culture_your_contribution",
          "text": "What''s one thing YOU could do to increase your own involvement or contribution to the group next quarter?",
          "type": "long",
          "required": false
        },
        {
          "id": "culture_social_events",
          "text": "Nat is proposing one social gathering per month (game night, craft night, etc.) in addition to the regular meeting. How does that feel?",
          "type": "choice",
          "options": ["Love it, I''m in", "Sounds good, I''ll come when I can", "Not sure", "Too much — I''d rather keep it to meetings"],
          "required": false
        },
        {
          "id": "culture_volunteer",
          "text": "And one volunteer / charity / community project per quarter (dog blankets for Nellis, meal prep, etc.) — how does that feel?",
          "type": "choice",
          "options": ["Love it, count me in", "Good idea, I''ll join when I can", "Not sure", "I''d rather keep that separate from HIVE"],
          "required": false
        },
        {
          "id": "culture_creed",
          "text": "Nat is working on developing a HIVE Creed — a short set of shared values or commitments the group writes together. What''s one thing you''d want in it?",
          "type": "long",
          "required": false
        },
        {
          "id": "s_anything_else",
          "text": "Anything else you want to share — a wish, a concern, or a note of appreciation? 🐝",
          "type": "long",
          "required": false
        }
      ]'::jsonb,
      true
    );

    RAISE NOTICE 'Q1 Exit Survey seeded for community %', v_community_id;
  ELSE
    RAISE NOTICE 'Q1 Exit Survey already exists — skipping.';
  END IF;
END $$;

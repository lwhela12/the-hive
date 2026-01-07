import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are the Hive Assistant, an AI helper for a close-knit community of 12 people practicing "high-definition wishing."

Your primary role is to help users articulate what they actually want. People often express vague desires ("I want to be healthier") or surface-level wants ("I want a new car"). Your job is to help them discover the underlying desire through curious, gentle questioning.

## Core Behaviors

1. **Always be conversational first.** You're not a form to fill out. Chat naturally. Let wishes and skills emerge organically.

2. **Listen for latent wishes.** When someone says "I'm having a rough day" - that might lead to a wish. When they say "I wish someone could help me with X" - that's definitely a wish. Probe gently.

3. **High-definition means specific and actionable.**
   - Low definition: "I want to learn to cook"
   - High definition: "I want someone to teach me 3 easy weeknight dinners I can make in under 30 minutes, starting with pasta dishes"

4. **Never push wishes public.** When a wish is well-articulated, ASK if they want to share it with the Hive. Respect if they say no.

5. **You have tools.** Use them naturally. Don't announce "I'm going to use my store_skill tool now." Just do it and confirm conversationally.

6. **You know the community.** You can see everyone's public wishes and skills. When relevant, mention potential matches.

7. **The Queen Bee is special.** The current Queen Bee's project takes priority. Look for ways to help their project.

8. **Consolidation over accumulation.** Help users refine and combine wishes rather than accumulating a long list.

## What NOT to Do

- Don't be sycophantic or overly enthusiastic
- Don't lecture about the "high definition wishing framework"
- Don't create wishes without the user's explicit involvement
- Don't share private wishes with others
- Don't make the user feel like they're being processed`;

const ONBOARDING_SKILLS_PROMPT = `You are helping a new member of The Hive discover and articulate their skills.

Your goal is to help them identify 2-3 skills they have that could benefit the community. Be curious and conversational.

When a skill is mentioned, use the store_skill tool to save it. Transform vague skills into high-definition ones.

After capturing 2-3 skills, suggest moving on to wishes.`;

const ONBOARDING_WISHES_PROMPT = `You are helping a new member of The Hive discover their first wishes.

These wishes will stay PRIVATE unless they choose to share. Help them feel comfortable expressing needs.

When a wish emerges clearly, use the store_wish tool to save it. Transform vague wishes into HD ones.

Remind them these stay private and they can refine them later.`;

const tools: Anthropic.Tool[] = [
  {
    name: "store_skill",
    description: "Store a skill/capability that the user has mentioned they possess.",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "The HD-articulated skill description" },
        raw_input: { type: "string", description: "What the user originally said" }
      },
      required: ["description", "raw_input"]
    }
  },
  {
    name: "store_wish",
    description: "Store a wish that has emerged from conversation. Wishes start as private.",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "The HD-articulated wish" },
        raw_input: { type: "string", description: "The original problem or desire expressed" }
      },
      required: ["description", "raw_input"]
    }
  },
  {
    name: "publish_wish",
    description: "Make a wish public to the Hive. Only call after explicit user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        wish_id: { type: "string", description: "The UUID of the wish to publish" }
      },
      required: ["wish_id"]
    }
  },
  {
    name: "get_user_wishes",
    description: "Retrieve the current user's wishes (both private and public)",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_user_skills",
    description: "Retrieve the current user's stored skills",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_public_wishes",
    description: "Get all public wishes from other Hive members.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_all_skills",
    description: "Get all skills from all Hive members.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_current_queen_bee",
    description: "Get information about the current Queen Bee and their project",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_hive_members",
    description: "Get list of all Hive members with basic info",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "fulfill_wish",
    description: "Mark a wish as fulfilled.",
    input_schema: {
      type: "object" as const,
      properties: {
        wish_id: { type: "string", description: "The wish ID to mark fulfilled" },
        fulfilled_by: { type: "string", description: "User ID of who fulfilled it" }
      },
      required: ["wish_id"]
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { message, mode, context } = await req.json();

    // Get user profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Get recent messages for context
    const { data: recentMessages } = await supabaseClient
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get user's skills and wishes for context
    const { data: userSkills } = await supabaseClient
      .from('skills')
      .select('description')
      .eq('user_id', user.id);

    const { data: userWishes } = await supabaseClient
      .from('wishes')
      .select('id, description, status, is_active')
      .eq('user_id', user.id);

    // Get current Queen Bee
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: queenBee } = await supabaseClient
      .from('queen_bees')
      .select('*, user:profiles(name)')
      .eq('month', currentMonth)
      .single();

    // Build context
    let systemPrompt = SYSTEM_PROMPT;
    if (mode === 'onboarding' && context === 'skills') {
      systemPrompt = ONBOARDING_SKILLS_PROMPT;
    } else if (mode === 'onboarding' && context === 'wishes') {
      systemPrompt = ONBOARDING_WISHES_PROMPT;
    }

    const contextInfo = `
## Current User Context
Name: ${profile?.name || 'Unknown'}

## Your Skills
${userSkills?.map(s => `- ${s.description}`).join('\n') || 'None recorded yet'}

## Your Wishes
${userWishes?.map(w => `- [${w.status}${w.is_active ? ', active' : ''}] ${w.description}`).join('\n') || 'None recorded yet'}

${queenBee ? `## Current Queen Bee
${queenBee.user?.name} - ${queenBee.project_title}
${queenBee.project_description || ''}` : ''}
`;

    // Build messages array
    const messages: Anthropic.MessageParam[] = [
      ...(recentMessages?.reverse().map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })) || []),
      { role: 'user' as const, content: message }
    ];

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: `${systemPrompt}\n\n${contextInfo}`,
      tools,
      messages
    });

    let skillsAdded = 0;

    // Handle tool use
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        let result: string;

        switch (toolUse.name) {
          case 'store_skill': {
            const { description, raw_input } = toolUse.input as { description: string; raw_input: string };
            const { error } = await supabaseClient.from('skills').insert({
              user_id: user.id,
              description,
              raw_input,
              extracted_from: mode === 'onboarding' ? 'onboarding' : 'chat'
            });
            result = error ? `Error: ${error.message}` : 'Skill saved successfully';
            if (!error) skillsAdded++;
            break;
          }

          case 'store_wish': {
            const { description, raw_input } = toolUse.input as { description: string; raw_input: string };
            const { error } = await supabaseClient.from('wishes').insert({
              user_id: user.id,
              description,
              raw_input,
              status: 'private',
              extracted_from: mode === 'onboarding' ? 'onboarding' : 'chat'
            });
            result = error ? `Error: ${error.message}` : 'Wish saved successfully';
            break;
          }

          case 'publish_wish': {
            const { wish_id } = toolUse.input as { wish_id: string };
            const { error } = await supabaseClient
              .from('wishes')
              .update({ status: 'public', is_active: true })
              .eq('id', wish_id)
              .eq('user_id', user.id);
            result = error ? `Error: ${error.message}` : 'Wish published to the Hive';
            break;
          }

          case 'get_user_wishes': {
            const { data } = await supabaseClient
              .from('wishes')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_user_skills': {
            const { data } = await supabaseClient
              .from('skills')
              .select('*')
              .eq('user_id', user.id);
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_public_wishes': {
            const { data } = await supabaseClient
              .from('wishes')
              .select('*, user:profiles(name)')
              .eq('status', 'public')
              .eq('is_active', true)
              .neq('user_id', user.id);
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_all_skills': {
            const { data } = await supabaseClient
              .from('skills')
              .select('*, user:profiles(name)');
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_current_queen_bee': {
            result = JSON.stringify(queenBee || null);
            break;
          }

          case 'get_hive_members': {
            const { data } = await supabaseClient
              .from('profiles')
              .select('id, name, avatar_url')
              .order('name');
            result = JSON.stringify(data || []);
            break;
          }

          case 'fulfill_wish': {
            const { wish_id, fulfilled_by } = toolUse.input as { wish_id: string; fulfilled_by?: string };
            const { error } = await supabaseClient
              .from('wishes')
              .update({
                status: 'fulfilled',
                is_active: false,
                fulfilled_at: new Date().toISOString(),
                fulfilled_by
              })
              .eq('id', wish_id)
              .eq('user_id', user.id);
            result = error ? `Error: ${error.message}` : 'Wish marked as fulfilled!';
            break;
          }

          default:
            result = 'Unknown tool';
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        });
      }

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: `${systemPrompt}\n\n${contextInfo}`,
        tools,
        messages
      });
    }

    // Extract text response
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return new Response(
      JSON.stringify({
        response: textBlock?.text || "I'm not sure how to respond to that.",
        skillsAdded
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

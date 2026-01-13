import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v4.15.4/index.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { buildContext } from './context/index.ts';

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

## New User Setup Flow

When a user says "I am ready" or indicates they want to begin setting up their goals/skills:

1. Say: "Great! I have a few questions for you."

2. Ask about time-sensitive objectives:
   "Do you have any clear time-sensitive objectives right now? Something you're working toward with a deadline or timeframe?"

3. If they have time-sensitive objectives:
   - Ask: "What's the timeframe you're working with?"
   - This helps determine their ideal Queen Bee month (when the community focuses on supporting them)
   - Use the update_profile tool with queen_bee_preference to save this information

4. Then transition to goals/skills:
   "Thanks! Now, which would you like to talk about first - your goals or your skills?"

5. Guide the conversation based on their choice, capturing skills and wishes as they emerge.

## Ongoing Setup Tracking

Check if user has stored skills or wishes in the context.
- If they have NO skills AND NO wishes, they haven't completed their initial setup
- When this is the case, periodically (not every message) remind them:
  "By the way, whenever you're ready, I'd love to chat about your goals and skills!"
- Don't remind every message - space it out naturally, maybe every 3-4 interactions

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

const UNIFIED_ONBOARDING_PROMPT = `You are welcoming a new member to The Hive. Guide them through getting to know each other in a single flowing conversation.

## Your Goals (in this order):
1. **Get to know them** - They've already been greeted with a birthday question. When they share their birthday, save it immediately with update_profile. If they share their phone number or preferred contact method, save those too.

2. **Discover their skills** - What are they good at? What do they enjoy doing? Aim for 2-3 skills. Use store_skill when a skill is clearly articulated. Transform vague skills into high-definition ones.

3. **Surface their first wish** - What would they like help with? These stay PRIVATE. Aim for at least 1 wish. Use store_wish when a wish emerges. Transform vague wishes into HD ones.

4. **Complete onboarding** - When you've captured their birthday (or they declined), 2+ skills, and 1+ wish, call complete_onboarding to signal we're done.

## Guidelines:
- Be warm and conversational, not robotic or form-like
- Use update_profile IMMEDIATELY when you learn birthday, phone, or name correction
- Use store_skill when a skill is clearly articulated (don't wait to batch them)
- Use store_wish when a wish emerges (even if vague, you can refine it)
- Let the conversation flow naturally between topics
- Don't announce tool usage - just use them and continue naturally
- After completing all goals, call complete_onboarding and give a warm wrap-up message`;

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
  },
  {
    name: "update_profile",
    description: "Update user profile information collected during conversation (birthday, phone, name correction, preferred contact method, Queen Bee month preference)",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "User's name (only if they want to correct it)" },
        birthday: { type: "string", description: "User's birthday in YYYY-MM-DD format" },
        phone: { type: "string", description: "User's phone number" },
        preferred_contact: { type: "string", description: "Preferred contact method: 'email' or 'phone'" },
        queen_bee_preference: {
          type: "object",
          description: "User's Queen Bee month preference with reason and timeframe for time-sensitive objectives",
          properties: {
            preferred_month: { type: "string", description: "Preferred month in YYYY-MM format (e.g., '2025-03')" },
            reason: { type: "string", description: "The time-sensitive objective or reason for this preference" },
            timeframe: { type: "string", description: "The timeframe they're working with (e.g., 'Q1 2025', 'by March')" }
          }
        }
      }
    }
  },
  {
    name: "complete_onboarding",
    description: "Signal that onboarding conversation is complete. Call this when the user has shared their birthday (or declined), at least 2 skills, and at least 1 wish.",
    input_schema: {
      type: "object" as const,
      properties: {}
    }
  }
];

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const JWKS = supabaseUrl ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/keys`)) : null;

const verifySupabaseJwt = async (authHeader: string | null) => {
  if (!supabaseUrl || !JWKS) {
    throw new Error('Missing SUPABASE_URL for JWT verification');
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${supabaseUrl}/auth/v1`,
    audience: 'authenticated',
  });
  return { token, payload };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const { token, payload } = await verifySupabaseJwt(authHeader);
    const userId = payload.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } } }
    );

    const { message, mode, context, conversation_id } = await req.json();

    // Get user profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const communityId = profile?.current_community_id;
    if (!communityId) {
      return new Response(JSON.stringify({ error: 'No active community' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build comprehensive context using the smart context builder
    const contextResult = await buildContext({
      supabase: supabaseClient,
      userId,
      communityId,
      conversationId: conversation_id,
      mode: mode || 'default',
    });

    // Select the appropriate system prompt based on mode
    let systemPrompt = SYSTEM_PROMPT;
    if (mode === 'onboarding' && context === 'skills') {
      systemPrompt = ONBOARDING_SKILLS_PROMPT;
    } else if (mode === 'onboarding' && context === 'wishes') {
      systemPrompt = ONBOARDING_WISHES_PROMPT;
    } else if (mode === 'onboarding' && !context) {
      // Unified onboarding flow
      systemPrompt = UNIFIED_ONBOARDING_PROMPT;
    }

    // The context builder already assembled all the context we need
    const contextInfo = contextResult.assembledContext;

    // Build messages array from context result + current message
    const messages: Anthropic.MessageParam[] = [
      ...contextResult.recentMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
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
    let onboardingComplete = false;

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
              user_id: userId,
              community_id: communityId,
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
              user_id: userId,
              community_id: communityId,
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
              .eq('user_id', userId)
              .eq('community_id', communityId);
            result = error ? `Error: ${error.message}` : 'Wish published to the Hive';
            break;
          }

          case 'get_user_wishes': {
            const { data } = await supabaseClient
              .from('wishes')
              .select('*')
              .eq('user_id', userId)
              .eq('community_id', communityId)
              .order('created_at', { ascending: false });
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_user_skills': {
            const { data } = await supabaseClient
              .from('skills')
              .select('*')
              .eq('user_id', userId)
              .eq('community_id', communityId);
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_public_wishes': {
            const { data } = await supabaseClient
              .from('wishes')
              .select('*, user:profiles(name)')
              .eq('status', 'public')
              .eq('is_active', true)
              .eq('community_id', communityId)
              .neq('user_id', userId);
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_all_skills': {
            const { data } = await supabaseClient
              .from('skills')
              .select('*, user:profiles(name)')
              .eq('community_id', communityId);
            result = JSON.stringify(data || []);
            break;
          }

          case 'get_current_queen_bee': {
            result = JSON.stringify(queenBee || null);
            break;
          }

          case 'get_hive_members': {
            const { data: memberRows } = await supabaseClient
              .from('community_memberships')
              .select('user_id')
              .eq('community_id', communityId);
            const memberIds = memberRows?.map((row) => row.user_id) || [];
            if (memberIds.length === 0) {
              result = JSON.stringify([]);
              break;
            }
            const { data } = await supabaseClient
              .from('profiles')
              .select('id, name, avatar_url')
              .in('id', memberIds)
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
              .eq('user_id', userId)
              .eq('community_id', communityId);
            result = error ? `Error: ${error.message}` : 'Wish marked as fulfilled!';
            break;
          }

          case 'update_profile': {
            const { name, birthday, phone, preferred_contact, queen_bee_preference } = toolUse.input as {
              name?: string;
              birthday?: string;
              phone?: string;
              preferred_contact?: string;
              queen_bee_preference?: {
                preferred_month?: string;
                reason?: string;
                timeframe?: string;
              };
            };
            const updates: Record<string, unknown> = {};
            if (name) updates.name = name;
            if (birthday) updates.birthday = birthday;
            if (phone) updates.phone = phone;
            if (preferred_contact) updates.preferred_contact = preferred_contact;
            if (queen_bee_preference) updates.queen_bee_preference = queen_bee_preference;

            if (Object.keys(updates).length > 0) {
              const { error } = await supabaseClient
                .from('profiles')
                .update(updates)
                .eq('id', userId);
              result = error ? `Error: ${error.message}` : 'Profile updated successfully';
            } else {
              result = 'No updates provided';
            }
            break;
          }

          case 'complete_onboarding': {
            onboardingComplete = true;
            result = 'Onboarding marked as complete. The user can now enter The Hive!';
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
        skillsAdded,
        onboardingComplete,
        // Include context metadata for debugging/monitoring
        contextMetadata: {
          tokensUsed: contextResult.metadata.tokensUsed,
          messageCount: contextResult.metadata.conversationMessageCount,
          summariesUsed: contextResult.metadata.summariesUsed,
          cacheHits: contextResult.metadata.cacheHits,
        }
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

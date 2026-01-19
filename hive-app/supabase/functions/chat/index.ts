import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { buildContext } from './context/index.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { corsHeaders, handleCors, errorResponse } from '../_shared/cors.ts';
import {
  getSSEHeaders,
  SSEWriter,
} from '../_shared/streaming.ts';

const SYSTEM_PROMPT = `You are the HIVE Assistant, an AI helper for a close-knit community of 12 people practicing "high-definition wishing."

**IMPORTANT: Always refer to the community as "the HIVE" (with HIVE in all caps). At the start of a sentence, use "The HIVE". Never write "the Hive" or "The Hive".**

## Your Core Purpose

People rarely know what they truly want. They express wishes in low resolution: "I want to be healthier," "I want a better job." Your role is **preference archaeology**—excavating underlying desires through curious, gentle questioning until the wish becomes specific, actionable, and often surprisingly different from the original expression.

## The HD Wishing Process

### 1. Accept the Surface Wish Without Judgment
When someone expresses a wish, receive it warmly. Don't immediately challenge or redirect. The surface wish is data—it tells you where to start digging.

### 2. Explore the Components
Every wish has layers. Ask questions that surface them:
- "What would having that give you?"
- "Imagine you have it—what's the first thing you'd do?"
- "What would change about your daily life?"
- "Who would you share this with?"
- "What's the feeling you're reaching for?"

### 3. Test Which Components Matter
Once components are visible, probe their relative weight:
- "If you could have [X experience] but not [Y thing], how would that feel?"
- "Is it more about the thing itself, or what achieving it represents?"

### 4. Handle "Impossible" Wishes
Some wishes can't be directly fulfilled ("I want my father back"). Decompose into actionable components through dialogue. Even impossible wishes often contain something achievable.

### 5. Arrive at High Definition
A high-definition wish is:
- **Specific**: Clear enough to recognize fulfillment
- **Actionable**: Someone could actually help with it
- **Authentic**: Reflects genuine desire, not what they think they "should" want
- **Bounded**: Has an "enough" threshold (floors, not ceilings)

Examples:
| Low Definition | High Definition |
|----------------|-----------------|
| "I want to learn to cook" | "I want to learn 3 weeknight dinners I can make in under 30 minutes, starting with pasta" |
| "I want to be healthier" | "I want to run a 5K without stopping by June, with a training buddy who'll text me on rest days" |
| "I want a better job" | "I want work that uses my data analysis skills, pays at least $80K, and doesn't require more than 5 hours of meetings per week" |

### 6. ALWAYS Confirm Before Saving
**CRITICAL: Never save a wish without explicit confirmation.** When you've arrived at an HD wish together:
1. Reflect it back clearly: "So your wish is: [articulated wish]"
2. Ask: "Does that capture it? Should I save this?"
3. Only call store_wish after they confirm

## Your Posture

- **Be curious, not clinical.** You're not administering a questionnaire. Follow threads that surprise you.
- **Non-attachment to outcomes.** You have no preference for cheap vs expensive wishes, practical vs romantic. Your only goal is clarity.
- **Never coerce transformation.** If they insist on the original wish after exploration, that's legitimate.
- **Protect authenticity.** Watch for wishes they think they "should" have. Probe gently: "That sounds reasonable—but does it excite you?"
- **Floors, not ceilings.** Help find "enough" rather than "maximum." Ask: "What's the minimum version that would actually satisfy you?"

## Core Behaviors

1. **Always be conversational first.** You're not a form to fill out. Chat naturally. Let wishes and skills emerge organically.

2. **Listen for latent wishes.** When someone says "I'm having a rough day"—that might lead to a wish. Probe gently.

3. **Never push wishes public.** When a wish is well-articulated and confirmed, ASK if they want to share it with the HIVE. Respect if they say no.

4. **You have tools.** Use them naturally. Don't announce tool usage—just use them and continue conversationally. But ALWAYS confirm wishes before saving.

5. **You know the community.** You can see everyone's public wishes and skills. When relevant, mention potential matches.

6. **You can see recent conversations.** Your context includes recent messages from chat rooms the user is part of (in the "Recent Conversations" section). Reference these naturally when relevant - you don't need a tool to access them, they're already in your context.

7. **You can reference board posts.** Use the search_board_posts and get_board_post tools to find and reference specific discussions.

8. **The Queen Bee is special.** The current Queen Bee's project takes priority. Look for ways to help their project.

9. **Consolidation over accumulation.** Help users refine and combine wishes rather than accumulating a long list.

## New User Setup Flow

When a user says "I am ready" or indicates they want to begin setting up their goals/skills:

1. Say: "Great! I have a few questions for you."

2. Ask about time-sensitive objectives:
   "Do you have any clear time-sensitive objectives right now? Something you're working toward with a deadline or timeframe?"

3. If they have time-sensitive objectives:
   - Ask: "What's the timeframe you're working with?"
   - Use the update_profile tool with queen_bee_preference to save this information

4. Then transition to goals/skills:
   "Thanks! Now, which would you like to talk about first—your goals or your skills?"

5. Guide the conversation, using the HD wishing process to refine wishes before saving.

## Ongoing Setup Tracking

Check if user has stored skills or wishes in the context.
- If they have NO skills AND NO wishes, they haven't completed their initial setup
- Periodically (every 3-4 interactions) remind them naturally:
  "By the way, whenever you're ready, I'd love to chat about your goals and skills!"

## Personality Profile Tracking

You maintain a private personality profile for each user. The user CAN see these notes on their profile page, so write observationally and helpfully, not judgmentally.

**When to update:** After meaningful conversations that reveal something new about who they are.

**What to include:** Communication style, recurring interests, projects they care about, people they mention, how they prefer to receive help, patterns in their wishes.

**What NOT to include:** Judgments, confidential information, speculation, negative framing.

## What NOT to Do

- Don't be sycophantic or overly enthusiastic
- Don't lecture about the "high definition wishing framework"—just use it
- Don't save wishes without explicit user confirmation
- Don't share private wishes with others
- Don't make the user feel analyzed or processed
- Don't rush to solutions before the wish is clear
- Don't project what you think they should want
- Don't assume impossible wishes have no actionable components`;

const ONBOARDING_SKILLS_PROMPT = `You are helping a new member of the HIVE discover and articulate their skills.

**IMPORTANT: Always refer to the community as "the HIVE" (with HIVE in all caps). At the start of a sentence, use "The HIVE".**

Your goal is to help them identify 2-3 skills they have that could benefit the community. Be curious and conversational.

When a skill is mentioned, use the store_skill tool to save it. Transform vague skills into high-definition ones.

After capturing 2-3 skills, suggest moving on to wishes.`;

const ONBOARDING_WISHES_PROMPT = `You are helping a new member of the HIVE discover their first wishes.

**IMPORTANT: Always refer to the community as "the HIVE" (with HIVE in all caps). At the start of a sentence, use "The HIVE".**

These wishes will stay PRIVATE unless they choose to share. Help them feel comfortable expressing needs.

Use the HD wishing process: explore what they really want through curious questioning, then transform vague wishes into specific, actionable ones.

**CRITICAL: Always confirm before saving.** When a wish is well-articulated:
1. Reflect it back: "So your wish is: [wish]"
2. Ask: "Does that capture it? Should I save this?"
3. Only call store_wish after they confirm

Remind them these stay private and they can refine them later.`;

const UNIFIED_ONBOARDING_PROMPT = `You are welcoming a new member to the HIVE. Guide them through getting to know each other in a single flowing conversation.

**IMPORTANT: Always refer to the community as "the HIVE" (with HIVE in all caps). At the start of a sentence, use "The HIVE".**

## Your Goals (in this order):
1. **Get to know them** - They've already been greeted with a birthday question. When they share their birthday, save it immediately with update_profile. If they share their phone number or preferred contact method, save those too.

2. **Discover their skills** - What are they good at? What do they enjoy doing? Aim for 2-3 skills. Use store_skill when a skill is clearly articulated. Transform vague skills into high-definition ones.

3. **Surface their first wish** - What would they like help with? These stay PRIVATE. Aim for at least 1 wish. Use the HD wishing process: explore what they really want, then transform vague wishes into specific, actionable ones. **Always confirm before saving** - reflect the wish back and ask "Does that capture it?" before calling store_wish.

4. **Complete onboarding** - When you've captured their birthday (or they declined), 2+ skills, and 1+ wish, call complete_onboarding to signal we're done.

## Guidelines:
- Be warm and conversational, not robotic or form-like
- Use update_profile IMMEDIATELY when you learn birthday, phone, or name correction
- Use store_skill when a skill is clearly articulated (don't wait to batch them)
- For wishes: explore, refine, confirm, THEN save with store_wish
- Let the conversation flow naturally between topics
- Don't announce tool usage - just use them and continue naturally
- After completing all goals, call complete_onboarding and give a warm wrap-up message`;

const REFINE_WISH_PROMPT = `You are helping a HIVE member refine their wish into a "high-definition" version.

**IMPORTANT: Always refer to the community as "the HIVE" (with HIVE in all caps). At the start of a sentence, use "The HIVE".**

They started with this rough wish:
"{rough_wish}"

## The HD Wishing Process

Your role is **preference archaeology**—excavating the underlying desire through curious, gentle questioning.

### 1. Accept the Surface Wish Without Judgment
Receive it warmly. The rough wish is data—it tells you where to start digging.

### 2. Explore the Components
Every wish has layers. Ask questions that surface them:
- "What would having that give you?"
- "Imagine you have it—what's the first thing you'd do?"
- "What would change about your daily life?"
- "What's the feeling you're reaching for?"

### 3. Test Which Components Matter
- "If you could have [X experience] but not [Y thing], how would that feel?"
- "Is it more about the thing itself, or what achieving it represents?"
- "What would 'enough' look like?" (floors, not ceilings)

### 4. Arrive at High Definition
A high-definition wish is:
- **Specific**: Clear enough to recognize fulfillment
- **Actionable**: Someone could actually help with it
- **Authentic**: Reflects genuine desire, not what they think they "should" want
- **Bounded**: Has an "enough" threshold

### 5. ALWAYS Confirm Before Saving
**CRITICAL: Never save without explicit confirmation.**
1. Reflect it back clearly: "So your wish is: [articulated wish]"
2. Ask: "Does that capture it? Should I save this?"
3. Only call store_wish after they confirm

### 6. After Saving
Ask: "Want to keep chatting, or head back to your profile?"

## Your Posture
- **Be curious, not clinical.** Follow threads that surprise you.
- **Non-attachment to outcomes.** No preference for cheap vs expensive, practical vs romantic.
- **Never coerce transformation.** If they insist on the original after exploration, that's legitimate.
- **Protect authenticity.** Watch for wishes they think they "should" have.

## Guidelines
- Keep it conversational and warm
- Don't lecture about "HD wishing"—just do it naturally
- One question at a time is fine
- The goal is THEIR clarity, not your checklist`;

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
    description: "Make a wish public to the HIVE. Only call after explicit user confirmation.",
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
    description: "Get all public wishes from other HIVE members.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_all_skills",
    description: "Get all skills from all HIVE members.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_current_queen_bee",
    description: "Get information about the current Queen Bee and their project",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "get_hive_members",
    description: "Get list of all HIVE members with basic info",
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
  },
  {
    name: "update_personality_notes",
    description: "Update your observational notes about this user. Use this to track patterns you notice: their communication style, interests, recurring themes in conversations, who they interact with, projects they care about. These notes are PRIVATE to the user (only they can see them). Update periodically when you learn something meaningful - not every message. Be observational and helpful, not judgmental.",
    input_schema: {
      type: "object" as const,
      properties: {
        notes: {
          type: "string",
          description: "Your updated personality notes. This REPLACES the previous notes, so include all relevant observations. Keep it concise but comprehensive. Format as natural prose, not a list."
        }
      },
      required: ["notes"]
    }
  },
  {
    name: "get_personality_notes",
    description: "Retrieve your current personality notes about this user to inform your understanding of them.",
    input_schema: {
      type: "object" as const,
      properties: {}
    }
  },
  {
    name: "search_board_posts",
    description: "Search and retrieve board posts from the HIVE message board. Use this to find specific discussions, reference threads in conversation, or look up what members have posted. Returns post details including ID, title, content snippet, author, category, reply count, and whether it's pinned.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search term to find in post titles or content. Leave empty to get recent posts."
        },
        category: {
          type: "string",
          description: "Filter by category name (e.g., 'Announcements', 'Queen Bee Updates', 'Resources')"
        },
        author_name: {
          type: "string",
          description: "Filter by author name"
        },
        limit: {
          type: "number",
          description: "Maximum number of posts to return (default: 10, max: 20)"
        }
      }
    }
  },
  {
    name: "get_board_post",
    description: "Get full details of a specific board post including all replies. Use this when you want to reference or discuss a specific thread.",
    input_schema: {
      type: "object" as const,
      properties: {
        post_id: {
          type: "string",
          description: "The UUID of the post to retrieve"
        }
      },
      required: ["post_id"]
    }
  }
];

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse('Server misconfigured', 500);
    }

    // Verify JWT manually (don't rely on gateway verification)
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const auth = await verifySupabaseJwt(authHeader);

    if (isAuthError(auth)) {
      return errorResponse(auth.error, auth.status);
    }

    const { userId, token } = auth;

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } } }
    );

    const { message, mode, context, conversation_id, attachments, stream = false, refine_wish } = await req.json();

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

    // Check if this is a wish refinement request (refine_wish contains the rough wish)
    const isRefineWish = !!refine_wish;

    // Select the appropriate system prompt based on mode
    let systemPrompt = SYSTEM_PROMPT;
    if (isRefineWish) {
      // Use the refine wish prompt with the rough wish inserted
      systemPrompt = REFINE_WISH_PROMPT.replace('{rough_wish}', refine_wish);
    } else if (mode === 'onboarding' && context === 'skills') {
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
    ];

    // Build the current user message, potentially with images (multimodal)
    if (attachments && attachments.length > 0) {
      // Create content blocks with images first, then text
      const contentBlocks: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [];

      // Add image blocks
      for (const attachment of attachments) {
        if (attachment.mime_type?.startsWith('image/')) {
          contentBlocks.push({
            type: 'image' as const,
            source: {
              type: 'url' as const,
              url: attachment.url,
            },
          });
        }
      }

      // Add text block (even if empty, Claude needs at least the text block)
      contentBlocks.push({
        type: 'text' as const,
        text: message || 'What do you see in this image?',
      });

      messages.push({ role: 'user' as const, content: contentBlocks });
    } else {
      messages.push({ role: 'user' as const, content: message });
    }

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
            result = error ? `Error: ${error.message}` : 'Wish published to the HIVE';
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
              .select('*, user:profiles!wishes_user_id_fkey(name)')
              .eq('status', 'public')
              .eq('is_active', true)
              .eq('community_id', communityId);
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
            const currentMonth = new Date().toISOString().slice(0, 7);
            const { data: qbData } = await supabaseClient
              .from('queen_bees')
              .select('*, user:profiles(name)')
              .eq('month', currentMonth)
              .eq('community_id', communityId)
              .single();
            result = JSON.stringify(qbData || null);
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
            result = 'Onboarding marked as complete. The user can now enter the HIVE!';
            break;
          }

          case 'update_personality_notes': {
            const { notes } = toolUse.input as { notes: string };

            // Try to update existing record, if none exists, insert
            const { data: existing } = await supabaseClient
              .from('user_insights')
              .select('id')
              .eq('user_id', userId)
              .eq('community_id', communityId)
              .single();

            if (existing) {
              const { error } = await supabaseClient
                .from('user_insights')
                .update({ personality_notes: notes })
                .eq('user_id', userId)
                .eq('community_id', communityId);
              result = error ? `Error: ${error.message}` : 'Personality notes updated';
            } else {
              const { error } = await supabaseClient
                .from('user_insights')
                .insert({
                  user_id: userId,
                  community_id: communityId,
                  personality_notes: notes,
                  shared_with: []
                });
              result = error ? `Error: ${error.message}` : 'Personality notes saved';
            }
            break;
          }

          case 'get_personality_notes': {
            const { data } = await supabaseClient
              .from('user_insights')
              .select('personality_notes')
              .eq('user_id', userId)
              .eq('community_id', communityId)
              .single();
            result = data?.personality_notes || 'No personality notes recorded yet.';
            break;
          }

          case 'search_board_posts': {
            const { query, category, author_name, limit: requestedLimit } = toolUse.input as {
              query?: string;
              category?: string;
              author_name?: string;
              limit?: number;
            };
            const postLimit = Math.min(requestedLimit || 10, 20);

            let postQuery = supabaseClient
              .from('board_posts')
              .select(`
                id,
                title,
                content,
                is_pinned,
                reply_count,
                created_at,
                category:board_categories(name, category_type),
                author:profiles!board_posts_author_id_fkey(name)
              `)
              .eq('community_id', communityId)
              .order('is_pinned', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(postLimit);

            // Apply search filter if query provided
            if (query) {
              postQuery = postQuery.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
            }

            const { data: posts, error: postsError } = await postQuery;

            if (postsError) {
              result = `Error searching posts: ${postsError.message}`;
              break;
            }

            // Filter by category name if provided (post-query since it's a joined field)
            let filteredPosts = posts || [];
            if (category) {
              filteredPosts = filteredPosts.filter((p: any) =>
                p.category?.name?.toLowerCase().includes(category.toLowerCase())
              );
            }

            // Filter by author name if provided
            if (author_name) {
              filteredPosts = filteredPosts.filter((p: any) =>
                p.author?.name?.toLowerCase().includes(author_name.toLowerCase())
              );
            }

            // Format results with content snippets
            const formattedPosts = filteredPosts.map((p: any) => ({
              id: p.id,
              title: p.title,
              content_snippet: p.content?.substring(0, 200) + (p.content?.length > 200 ? '...' : ''),
              author: p.author?.name || 'Unknown',
              category: p.category?.name || 'General',
              is_pinned: p.is_pinned,
              reply_count: p.reply_count || 0,
              created_at: p.created_at
            }));

            result = JSON.stringify(formattedPosts);
            break;
          }

          case 'get_board_post': {
            const { post_id } = toolUse.input as { post_id: string };

            // Get the post with full content
            const { data: post, error: postError } = await supabaseClient
              .from('board_posts')
              .select(`
                id,
                title,
                content,
                is_pinned,
                reply_count,
                created_at,
                category:board_categories(name, category_type),
                author:profiles!board_posts_author_id_fkey(name, avatar_url)
              `)
              .eq('id', post_id)
              .eq('community_id', communityId)
              .single();

            if (postError || !post) {
              result = `Error: Post not found or access denied`;
              break;
            }

            // Get replies
            const { data: replies } = await supabaseClient
              .from('board_replies')
              .select(`
                id,
                content,
                created_at,
                author:profiles!board_replies_author_id_fkey(name)
              `)
              .eq('post_id', post_id)
              .order('created_at', { ascending: true });

            const formattedPost = {
              id: post.id,
              title: post.title,
              content: post.content,
              author: (post.author as any)?.name || 'Unknown',
              category: (post.category as any)?.name || 'General',
              is_pinned: post.is_pinned,
              created_at: post.created_at,
              replies: (replies || []).map((r: any) => ({
                id: r.id,
                content: r.content,
                author: r.author?.name || 'Unknown',
                created_at: r.created_at
              }))
            };

            result = JSON.stringify(formattedPost);
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

    const finalText = textBlock?.text || "I'm not sure how to respond to that.";

    // If streaming is not requested, return JSON response (backward compatible)
    if (!stream) {
      return new Response(
        JSON.stringify({
          response: finalText,
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
    }

    // Streaming response using SSE
    const { readable, writable } = new TransformStream();
    const sseWriter = new SSEWriter(writable);

    // Process streaming in the background
    (async () => {
      try {
        // Send start event
        await sseWriter.write({ type: 'start' });

        // Send content start
        await sseWriter.write({ type: 'content_start' });

        // Stream the final text in chunks - use smaller chunks and longer delays
        // for a more visible streaming effect
        const chunkSize = 12; // Small chunks for smooth streaming
        const delayMs = 25; // Delay between chunks

        for (let i = 0; i < finalText.length; i += chunkSize) {
          const chunk = finalText.slice(i, i + chunkSize);
          // Use 'chunk' as data type so frontend knows to parse it specially
          await sseWriter.write({ type: 'content_delta', data: { text: chunk } });
          // Add delay between chunks (except for the last one)
          if (i + chunkSize < finalText.length) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }

        // Send content done with full text
        await sseWriter.write({ type: 'content_done', data: finalText });

        // Send metadata
        await sseWriter.write({
          type: 'metadata',
          data: {
            skillsAdded,
            onboardingComplete,
            contextMetadata: {
              tokensUsed: contextResult.metadata.tokensUsed,
              messageCount: contextResult.metadata.conversationMessageCount,
              summariesUsed: contextResult.metadata.summariesUsed,
              cacheHits: contextResult.metadata.cacheHits,
            },
          },
        });

        // Send done
        await sseWriter.write({ type: 'done' });
      } catch (err) {
        console.error('Streaming error:', err);
        await sseWriter.write({ type: 'error', data: { error: 'Streaming failed' } });
        await sseWriter.write({ type: 'done' });
      } finally {
        await sseWriter.close();
      }
    })();

    return new Response(readable, { headers: getSSEHeaders() });

  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

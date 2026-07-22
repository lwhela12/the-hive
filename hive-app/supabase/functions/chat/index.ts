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

const SYSTEM_PROMPT = `You are Clive, HIVE's assistant, an AI helper for H.I.V.E. (Human Insight Vision Execution), a close-knit community of 12 people practicing "high-definition wishing."

**IMPORTANT: Use "H.I.V.E." for the formal brand name and "HIVE" in product copy. Avoid article-prefixed, mixed-case, or lowercase brand variants.**
**Identity: Your name is Clive. The signed-in user's name appears in context; that is the human you are helping, not you. If the user addresses "Clive," they are talking to you. Never claim to be the signed-in user.**
**Speed posture: respond quickly and concisely by default. Prefer 1-3 short paragraphs, ask one clear next question, and only go deep when the user asks for depth or the task truly requires it.**
**Meeting recall: you DO have access to meeting notes — when someone missed a meeting or asks what happened at one, call get_meeting_summaries and give them a warm recap (highlights, decisions, anything about them specifically). Never say you can't see meeting notes.**

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

3. **Be clear about visibility.** Saved wishes are HD Wishes visible to HIVE members. Before saving, make sure the user has confirmed the wording and understands it will be shared with HIVE.

4. **You have tools.** Use them naturally. Don't announce tool usage—just use them and continue conversationally. But ALWAYS confirm wishes before saving.

5. **You know the community.** You can see everyone's public wishes and skills. When relevant, mention potential matches.

6. **Separate community knowledge from private user context.** Your community knowledge comes from HIVE boards, visible current/granted community wishes, skills, events, meetings, and Honey Pot. The signed-in user's own profile, action items, and Clive conversation are private context for helping that user only; do not treat them as community knowledge or reveal them to other members unless the user shares them to a public board, wish, event, or other shared HIVE surface. Do not claim to see, summarize, infer from, or act on private chat rooms, DMs, group DMs, or private room messages. If someone asks what private messages say, explain that you cannot inspect them.

7. **You can reference board posts.** Use the search_board_posts and get_board_post tools to find and reference specific discussions.

7a. **HD boards are active member goals.** A board with board_type "hd_board" belongs to a specific member and project/goal. Treat posts there as resources, offers, blockers, and updates for that member's HummDinger/High Definition wish. A board with board_type "helper_log" records 15-minute HIVE helper acts for recaps, newsletters, and slide decks.

7b. **You can steward the app, but use a two-step safety flow.** For requests that would change shared app state (create boards/posts/events/action items, mark todos complete, fulfill wishes, or complete/archive HD boards), first inspect anything you need with read tools, then call propose_app_actions with the exact changes. Tell the user what will happen and ask them to say "apply it" or "yes, do it." Only call apply_pending_actions when the user's latest message clearly approves a pending proposal from a previous assistant response. Never propose and apply in the same response. Never apply destructive or broad changes from vague approval.

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
- Don't save wishes without confirming that they will be visible to HIVE members
- Don't make the user feel analyzed or processed
- Don't rush to solutions before the wish is clear
- Don't project what you think they should want
- Don't assume impossible wishes have no actionable components`;

const ONBOARDING_SKILLS_PROMPT = `You are helping a new member of HIVE discover and articulate their skills.

**IMPORTANT: Use "H.I.V.E." for the formal brand name and "HIVE" in product copy. Avoid article-prefixed, mixed-case, or lowercase brand variants.**

Your goal is to help them identify 2-3 skills they have that could benefit the community. Be curious and conversational.

When a skill is mentioned, use the store_skill tool to save it. Transform vague skills into high-definition ones.

After capturing 2-3 skills, suggest moving on to wishes.`;

const ONBOARDING_WISHES_PROMPT = `You are helping a new member of HIVE discover their first wishes.

**IMPORTANT: Use "H.I.V.E." for the formal brand name and "HIVE" in product copy. Avoid article-prefixed, mixed-case, or lowercase brand variants.**

Saved wishes become HD Wishes visible to HIVE members, so help them feel comfortable shaping a wish they are ready to share.

Use the HD wishing process: explore what they really want through curious questioning, then transform vague wishes into specific, actionable ones.

**CRITICAL: Always confirm before saving.** When a wish is well-articulated:
1. Reflect it back: "So your wish is: [wish]"
2. Ask: "Does that capture it? Should I save this?"
3. Only call store_wish after they confirm

Remind them they can refine the wording before saving and edit it later.`;

const UNIFIED_ONBOARDING_PROMPT = `You are welcoming a new member to HIVE. Guide them through getting to know each other in a single flowing conversation.

**IMPORTANT: Use "H.I.V.E." for the formal brand name and "HIVE" in product copy. Avoid article-prefixed, mixed-case, or lowercase brand variants.**

## Your Goals (in this order):
1. **Get to know them** - They've already been greeted with a birthday question. When they share their birthday, save it immediately with update_profile. If they share their phone number or preferred contact method, save those too.

2. **Discover their skills** - What are they good at? What do they enjoy doing? Aim for 2-3 skills. Use store_skill when a skill is clearly articulated. Transform vague skills into high-definition ones.

3. **Surface their first wish** - What would they like help with? Saved wishes are visible HD Wishes. Aim for at least 1 wish. Use the HD wishing process: explore what they really want, then transform vague wishes into specific, actionable ones. **Always confirm before saving** - reflect the wish back and ask "Does that capture it? Should I save this as an HD Wish?" before calling store_wish.

4. **Complete onboarding** - When you've captured their birthday (or they declined), 2+ skills, and 1+ wish, call complete_onboarding to signal we're done.

## Guidelines:
- Be warm and conversational, not robotic or form-like
- Use update_profile IMMEDIATELY when you learn birthday, phone, or name correction
- Use store_skill when a skill is clearly articulated (don't wait to batch them)
- For wishes: explore, refine, confirm, THEN save with store_wish
- Let the conversation flow naturally between topics
- Don't announce tool usage - just use them and continue naturally
- After completing all goals, call complete_onboarding and give a warm wrap-up message`;

const QUICK_SURPRISE_RESPONSES = [
  "Tiny HIVE spark: text someone, \"What's one thing that would make this week 10% easier?\" If it takes 15 minutes or less, offer to help.",
  "Quick riddle: I get bigger the more you share me, but smaller when you keep me secret. What am I? A wish.",
  "Micro-adventure: pick one ordinary object near you and imagine it belongs in your future dream room. What changed about the room?",
  "Surprise prompt: what is one tiny luxury you could make repeatable, not occasional?",
  "Two-minute reset: unclench your jaw, drop your shoulders, and name one thing you want help making lighter.",
];
const QUICK_JOKE_RESPONSES = [
  "Why did the bee bring a notebook to the meeting? Because it wanted to keep its buzz-ness in order.",
  "I tried to organize a HIVE pun contest, but everyone said the jokes were too swarm.",
  "Why did the wish go to the gym? It wanted to become more actionable.",
];
const QUICK_RIDDLE_RESPONSES = [
  "Riddle me this: I get clearer when people ask questions, and stronger when people help carry me. What am I? A high-definition wish.",
  "I can be tiny, but I move a whole project forward. I often take 15 minutes and make someone feel less alone. What am I? A HIVE helper act.",
  "I am not a task, but I can turn into one. I am not a dream, but I point toward one. What am I? A wish.",
];

const FAST_CHAT_MODEL = 'claude-haiku-4-5';
const DEEP_CHAT_MODEL = 'claude-sonnet-4-5-20250929';
const CHAT_MAX_TOKENS = 700;

function selectChatModel(message: unknown, refineWish?: unknown) {
  if (typeof message !== 'string') return FAST_CHAT_MODEL;
  const text = message.toLowerCase();
  const needsDeepAppStewardship =
    /\b(apply it|yes, do it|create board|create event|action item|to do|todo|task|wish|duplicate|duplicates|dedupe|delete|archive|mark .* complete|complete .* board|move .* wish|clean up|bulk|all of them)\b/.test(text);

  return refineWish || needsDeepAppStewardship ? DEEP_CHAT_MODEL : FAST_CHAT_MODEL;
}

function isQuickSurpriseRequest(message: unknown, mode?: string, refineWish?: unknown, attachments?: unknown[]): boolean {
  return (
    typeof message === 'string' &&
    (mode || 'default') === 'default' &&
    !refineWish &&
    (!attachments || attachments.length === 0) &&
    message.trim().toLowerCase() === 'surprise me'
  );
}

function getQuickSurpriseResponse(): string {
  return QUICK_SURPRISE_RESPONSES[Math.floor(Math.random() * QUICK_SURPRISE_RESPONSES.length)];
}

function getQuickPlayfulResponse(message: unknown, mode?: string, refineWish?: unknown, attachments?: unknown[]): string | null {
  if (
    typeof message !== 'string' ||
    (mode || 'default') !== 'default' ||
    refineWish ||
    (attachments && attachments.length > 0)
  ) {
    return null;
  }

  const normalized = message.trim().toLowerCase();
  const responses = normalized === 'tell me a joke'
    ? QUICK_JOKE_RESPONSES
    : normalized === 'give me a riddle'
      ? QUICK_RIDDLE_RESPONSES
      : null;

  return responses ? responses[Math.floor(Math.random() * responses.length)] : null;
}

function quickContextMetadata() {
  return {
    tokensUsed: 0,
    messageCount: 0,
    summariesUsed: 0,
    cacheHits: 0,
    quickPath: true,
  };
}

function quickJsonResponse(response: string): Response {
  return new Response(
    JSON.stringify({
      response,
      skillsAdded: 0,
      onboardingComplete: false,
      contextMetadata: quickContextMetadata(),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function quickStreamResponse(response: string): Response {
  const { readable, writable } = new TransformStream();
  const sseWriter = new SSEWriter(writable);

  (async () => {
    try {
      await sseWriter.write({ type: 'start' });
      await sseWriter.write({ type: 'content_start' });
      await sseWriter.write({ type: 'content_delta', data: { text: response } });
      await sseWriter.write({ type: 'content_done', data: response });
      await sseWriter.write({
        type: 'metadata',
        data: {
          skillsAdded: 0,
          onboardingComplete: false,
          contextMetadata: quickContextMetadata(),
        },
      });
      await sseWriter.write({ type: 'done' });
    } finally {
      await sseWriter.close();
    }
  })();

  return new Response(readable, { headers: getSSEHeaders() });
}

const REFINE_WISH_PROMPT = `You are helping a HIVE member refine their wish into a "high-definition" version.

**IMPORTANT: Use "H.I.V.E." for the formal brand name and "HIVE" in product copy. Avoid article-prefixed, mixed-case, or lowercase brand variants.**

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
    description: "Store a confirmed HD Wish that will be visible to HIVE members.",
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
    description: "Ensure a wish is visible as an HD Wish. Only call after explicit user confirmation.",
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
    description: "Retrieve the current user's wishes",
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
    description: "Search and retrieve HIVE board posts and replies by title, content, board/category, HD board owner, author, and common member nicknames. Use this to find specific discussions, reference threads in conversation, or look up what members have posted. Returns post details including ID, title, content snippet, author, category, reply count, and whether it's pinned.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search term to find in post titles or content. Leave empty to get recent posts."
        },
        category: {
          type: "string",
          description: "Filter by category name (e.g., 'Announcements', 'HIVE Approved', '15min HIVE Helpers')"
        },
        author_name: {
          type: "string",
          description: "Filter by author name"
        },
        owner_name: {
          type: "string",
          description: "Filter by HD board owner name or nickname, such as Fin for Infiniti"
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
  },
  {
    name: "get_board_categories",
    description: "List HIVE message board categories, including HD board owner/goal/status metadata. Use before proposing board changes or checking whether a board already exists.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Optional text to match in board name, goal, or description" },
        topic_kind: { type: "string", description: "Optional: discussion, hd_board, or helper_log" },
        owner_name: { type: "string", description: "Optional member name for HD boards" },
        status: { type: "string", description: "Optional: active, completed, or archived" },
        limit: { type: "number", description: "Maximum categories to return (default 20, max 50)" }
      }
    }
  },
  {
    name: "get_meeting_summaries",
    description: "Get recent HIVE meeting summaries and notes (imported notes, transcripts, decisions). Use whenever someone missed a meeting or asks what happened at one — you DO have access to meeting notes through this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "How many recent meetings to return (default 1, max 5)" },
        include_transcript: { type: "boolean", description: "Include the raw notes/transcript text (truncated). Default true for the most recent meeting." }
      }
    }
  },
  {
    name: "search_action_items",
    description: "Search meeting/manual action items before proposing completion or cleanup.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search text for the action item description" },
        assignee_name: { type: "string", description: "Optional assigned member name" },
        completed: { type: "boolean", description: "Optional completed filter" },
        limit: { type: "number", description: "Maximum action items to return (default 20, max 50)" }
      }
    }
  },
  {
    name: "search_wishes",
    description: "Search visible HD Wishes before proposing to mark one fulfilled.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search text for wish description" },
        member_name: { type: "string", description: "Optional wish owner name" },
        status: { type: "string", description: "Optional wish status: public, fulfilled, or replaced" },
        limit: { type: "number", description: "Maximum wishes to return (default 20, max 50)" }
      }
    }
  },
  {
    name: "propose_app_actions",
    description: "Create a pending, user-approved action plan for shared app changes. This does not apply changes. Use this for creating boards/posts/events/action items, completing todos, fulfilling wishes, or completing HD boards.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Plain-language summary of the proposed app changes" },
        actions: {
          type: "array",
          description: "Ordered app actions to run after user approval",
          items: {
            type: "object",
            properties: {
              action_type: {
                type: "string",
                description: "One of: create_action_item, create_hd_board, create_discussion_board, create_board_post, mark_action_items_complete, mark_wishes_fulfilled, mark_hd_boards_complete, create_event"
              },
              owner_name: { type: "string", description: "Member who owns the HD board or wish" },
              goal_title: { type: "string", description: "HD board goal/project title" },
              board_name: { type: "string", description: "Board/category name or search text" },
              title: { type: "string", description: "Post, event, or short task title" },
              content: { type: "string", description: "Post content" },
              description: { type: "string", description: "Board, event, or action item description" },
              query: { type: "string", description: "Search text for todos, wishes, or boards to update" },
              assignee_name: { type: "string", description: "Action item assignee name; omit to assign the task to the signed-in user" },
              completion_note: { type: "string", description: "Note explaining what was completed" },
              due_date: { type: "string", description: "Optional action item due date in YYYY-MM-DD format" },
              event_date: { type: "string", description: "Event date in YYYY-MM-DD format" },
              event_time: { type: "string", description: "Event time in HH:MM format" },
              location: { type: "string", description: "Event location" },
              icon: { type: "string", description: "Optional board icon emoji" }
            },
            required: ["action_type"]
          }
        }
      },
      required: ["summary", "actions"]
    }
  },
  {
    name: "apply_pending_actions",
    description: "Apply the latest pending app action proposal after the user's latest message clearly approves it.",
    input_schema: {
      type: "object" as const,
      properties: {
        request_id: { type: "string", description: "Optional pending action request ID. If omitted, applies the latest pending request in this conversation." }
      }
    }
  }
];

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

type AppActionType =
  | 'create_action_item'
  | 'create_hd_board'
  | 'create_discussion_board'
  | 'create_board_post'
  | 'mark_action_items_complete'
  | 'mark_wishes_fulfilled'
  | 'mark_hd_boards_complete'
  | 'create_event';

type AppAction = {
  action_type: AppActionType;
  owner_name?: string;
  goal_title?: string;
  board_name?: string;
  title?: string;
  content?: string;
  description?: string;
  query?: string;
  assignee_name?: string;
  completion_note?: string;
  due_date?: string;
  event_date?: string;
  event_time?: string;
  location?: string;
  icon?: string;
};

type MemberRecord = {
  id: string;
  name: string;
};

type BoardCategoryRecord = {
  id: string;
  name: string;
  description?: string | null;
  topic_kind?: string | null;
  goal_title?: string | null;
  owner_user_id?: string | null;
  status?: string | null;
  display_order?: number | null;
  owner?: { name?: string | null } | null;
};

type ActionExecutionResult = {
  action_type: AppActionType | string;
  ok: boolean;
  message: string;
  ids?: string[];
};

const MEMBER_ALIASES: Record<string, string> = {
  brit: 'brittany',
  ollie: 'oliver',
  izzy: 'isabelle',
  fin: 'infiniti',
  infinite: 'infiniti',
  ems: 'emmeline',
};
const SEARCH_STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 's', 'the', 'to']);

const normalizeText = (value?: string | null) =>
  (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const firstName = (name?: string | null) => {
  const first = name?.trim().split(/\s+/)[0];
  return first || 'Member';
};

const normalizedNameQuery = (name?: string | null) => {
  const normalized = normalizeText(name);
  return MEMBER_ALIASES[normalized] || normalized;
};

const expandSearchTermAliases = (term?: string | null) => {
  const normalized = normalizeText(term);
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized && !compact) return [];

  const terms = new Set<string>();
  if (normalized) terms.add(normalized);
  if (compact && compact !== normalized) terms.add(compact);

  const directTarget = MEMBER_ALIASES[normalized] || MEMBER_ALIASES[compact];
  if (directTarget) terms.add(directTarget);

  Object.entries(MEMBER_ALIASES).forEach(([alias, target]) => {
    if (target === normalized || target === compact || normalized.includes(target) || compact.includes(target)) {
      terms.add(alias);
    }
  });

  return Array.from(terms).filter(Boolean);
};

const searchTokenGroups = (query?: string | null) => {
  const normalized = normalizeText(query);
  if (!normalized) return [];

  const groups = normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
    .map(expandSearchTermAliases);

  return groups.length > 0 ? groups : [expandSearchTermAliases(normalized)];
};

const matchesSearchQuery = (values: Array<string | null | undefined>, query?: string | null) => {
  const groups = searchTokenGroups(query);
  if (groups.length === 0) return true;

  const haystack = normalizeText(values.filter(Boolean).join(' '));
  const compactHaystack = haystack.replace(/\s+/g, '');

  return groups.every((terms) =>
    terms.some((term) => haystack.includes(term) || compactHaystack.includes(term.replace(/\s+/g, '')))
  );
};

const hasExplicitApproval = (message?: string | null) => {
  const normalized = normalizeText(message);
  if (!normalized) return false;
  if (/\b(no|nope|not yet|dont|don t|do not|wait|hold|stop|cancel)\b/.test(normalized)) {
    return false;
  }
  return /\b(yes|yep|yeah|approved|approve|apply|do it|go ahead|make it happen|run it|looks good|confirmed)\b/.test(normalized);
};

const actionSummary = (action: AppAction) => {
  switch (action.action_type) {
    case 'create_action_item':
      return `Create action item "${action.description || action.title || 'Untitled task'}"${action.assignee_name ? ` for ${action.assignee_name}` : ''}`;
    case 'create_hd_board':
      return `Create HD board for ${action.owner_name || 'member'}: ${action.goal_title || action.board_name || 'Untitled goal'}`;
    case 'create_discussion_board':
      return `Create discussion board "${action.board_name || action.title || 'Untitled board'}"`;
    case 'create_board_post':
      return `Create board post "${action.title || 'Untitled post'}" in ${action.board_name || 'a board'}`;
    case 'mark_action_items_complete':
      return `Mark action items complete matching "${action.query || action.title || ''}"`;
    case 'mark_wishes_fulfilled':
      return `Mark wishes fulfilled matching "${action.query || action.goal_title || ''}"`;
    case 'mark_hd_boards_complete':
      return `Mark HD boards complete matching "${action.board_name || action.query || action.goal_title || ''}"`;
    case 'create_event':
      return `Create event "${action.title || 'Untitled event'}" on ${action.event_date || 'a date to confirm'}`;
    default:
      return action.action_type;
  }
};

async function getCommunityMembers(
  supabase: SupabaseClient,
  communityId: string
): Promise<MemberRecord[]> {
  const { data: membershipRows } = await supabase
    .from('community_memberships')
    .select('user_id')
    .eq('community_id', communityId);

  const memberIds = membershipRows?.map((row: any) => row.user_id).filter(Boolean) || [];
  if (memberIds.length === 0) return [];

  const { data: members } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', memberIds)
    .order('name');

  return (members || []) as MemberRecord[];
}

async function findMemberByName(
  supabase: SupabaseClient,
  communityId: string,
  name?: string | null
): Promise<MemberRecord | null> {
  const target = normalizedNameQuery(name);
  if (!target) return null;

  const members = await getCommunityMembers(supabase, communityId);
  return members.find((member) => {
    const normalizedMemberName = normalizeText(member.name);
    const normalizedFirst = normalizeText(firstName(member.name));
    return (
      normalizedMemberName === target ||
      normalizedFirst === target ||
      normalizedMemberName.includes(target) ||
      target.includes(normalizedFirst)
    );
  }) || null;
}

async function getNextBoardDisplayOrder(
  supabase: SupabaseClient,
  communityId: string
) {
  const { data } = await supabase
    .from('board_categories')
    .select('display_order')
    .eq('community_id', communityId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data?.display_order as number | undefined) ?? 0) + 1;
}

async function ensureBoardMemberTag(
  supabase: SupabaseClient,
  communityId: string,
  categoryId: string,
  memberId: string,
  taggedBy: string
) {
  await supabase
    .from('board_category_member_tags')
    .upsert({
      community_id: communityId,
      category_id: categoryId,
      tagged_user_id: memberId,
      tagged_by: taggedBy,
    }, { onConflict: 'category_id,tagged_user_id' });
}

async function listBoardCategories(
  supabase: SupabaseClient,
  communityId: string,
  options: {
    query?: string;
    topic_kind?: string;
    owner_name?: string;
    status?: string;
    limit?: number;
  } = {}
): Promise<BoardCategoryRecord[]> {
  const limit = Math.min(options.limit || 50, 50);
  let query = supabase
    .from('board_categories')
    .select('id, name, description, topic_kind, goal_title, owner_user_id, status, display_order, owner:profiles!board_categories_owner_user_id_fkey(name)')
    .eq('community_id', communityId)
    .order('display_order')
    .limit(limit);

  if (options.topic_kind) query = query.eq('topic_kind', options.topic_kind);
  if (options.status) query = query.eq('status', options.status);

  const { data } = await query;
  let categories = (data || []) as BoardCategoryRecord[];

  if (normalizeText(options.query)) {
    categories = categories.filter((category) =>
      matchesSearchQuery([category.name, category.goal_title, category.description, category.owner?.name], options.query)
    );
  }

  const ownerQuery = normalizedNameQuery(options.owner_name);
  if (ownerQuery) {
    categories = categories.filter((category) => {
      const ownerName = normalizeText(category.owner?.name || '');
      const ownerFirst = normalizeText(firstName(category.owner?.name));
      return ownerName.includes(ownerQuery) || ownerFirst === ownerQuery || ownerQuery.includes(ownerFirst);
    });
  }

  return categories;
}

async function findBoardCategory(
  supabase: SupabaseClient,
  communityId: string,
  action: AppAction
) {
  const categories = await listBoardCategories(supabase, communityId, {
    topic_kind: action.action_type === 'mark_hd_boards_complete' ? 'hd_board' : undefined,
    owner_name: action.owner_name,
    limit: 50,
  });

  const target = normalizeText(`${action.board_name || ''} ${action.goal_title || ''} ${action.query || ''}`);
  if (!target && action.action_type !== 'create_board_post') return null;

  if (action.action_type === 'create_board_post' && /15\s*min|helper/.test(target)) {
    const helper = categories.find((category) => category.topic_kind === 'helper_log');
    if (helper) return helper;
  }

  return categories.find((category) => {
    const haystack = normalizeText(`${category.name} ${category.goal_title || ''} ${category.description || ''}`);
    return target ? haystack.includes(target) || target.includes(normalizeText(category.goal_title || category.name)) : false;
  }) || null;
}

async function createHdBoard(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const owner = await findMemberByName(supabase, communityId, action.owner_name);
  if (!owner) {
    return { action_type: action.action_type, ok: false, message: `Could not find member "${action.owner_name || ''}".` };
  }

  const goalTitle = (action.goal_title || action.board_name || action.title || '').trim();
  if (!goalTitle) {
    return { action_type: action.action_type, ok: false, message: 'HD board needs a goal title.' };
  }

  const boardName = `${firstName(owner.name)}'s HD: ${goalTitle}`;
  const displayOrder = await getNextBoardDisplayOrder(supabase, communityId);
  const description = action.description || action.content || `${firstName(owner.name)} is looking for HIVE help with ${goalTitle}.`;

  const { data: category, error } = await supabase
    .from('board_categories')
    .upsert({
      community_id: communityId,
      name: boardName,
      description,
      category_type: 'custom',
      icon: action.icon || '💎',
      display_order: displayOrder,
      is_system: false,
      requires_admin: false,
      requires_approval: false,
      created_by: userId,
      topic_kind: 'hd_board',
      goal_title: goalTitle,
      owner_user_id: owner.id,
      audience: 'members',
      status: 'active',
      completed_at: null,
      completed_by: null,
      completion_note: null,
    }, { onConflict: 'community_id,name' })
    .select('id, name')
    .single();

  if (error || !category) {
    return { action_type: action.action_type, ok: false, message: `Could not create HD board: ${error?.message || 'unknown error'}` };
  }

  await ensureBoardMemberTag(supabase, communityId, category.id, owner.id, userId);

  if (action.content || action.title) {
    await supabase.from('board_posts').insert({
      community_id: communityId,
      category_id: category.id,
      author_id: userId,
      title: action.title || 'Clive-created starting point',
      content: action.content || description,
    });
  }

  return { action_type: action.action_type, ok: true, message: `Created or refreshed ${category.name}.`, ids: [category.id] };
}

async function createDiscussionBoard(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const boardName = (action.board_name || action.title || action.goal_title || '').trim();
  if (!boardName) {
    return { action_type: action.action_type, ok: false, message: 'Discussion board needs a name.' };
  }

  const displayOrder = await getNextBoardDisplayOrder(supabase, communityId);
  const description = action.description || action.content || null;
  const { data: category, error } = await supabase
    .from('board_categories')
    .upsert({
      community_id: communityId,
      name: boardName,
      description,
      category_type: 'custom',
      icon: action.icon || '1F4DD',
      display_order: displayOrder,
      is_system: false,
      requires_admin: false,
      requires_approval: false,
      created_by: userId,
      topic_kind: 'discussion',
      goal_title: null,
      owner_user_id: null,
      audience: 'community',
      status: 'active',
      completed_at: null,
      completed_by: null,
      completion_note: null,
    }, { onConflict: 'community_id,name' })
    .select('id, name')
    .single();

  if (error || !category) {
    return { action_type: action.action_type, ok: false, message: `Could not create discussion board: ${error?.message || 'unknown error'}` };
  }

  if (action.content) {
    await supabase.from('board_posts').insert({
      community_id: communityId,
      category_id: category.id,
      author_id: userId,
      title: action.title && action.title !== boardName ? action.title : 'Starting point',
      content: action.content,
    });
  }

  return { action_type: action.action_type, ok: true, message: `Created or refreshed ${category.name}.`, ids: [category.id] };
}

async function createBoardPost(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const category = await findBoardCategory(supabase, communityId, action);
  if (!category) {
    return { action_type: action.action_type, ok: false, message: `Could not find board "${action.board_name || action.query || ''}".` };
  }

  const title = (action.title || '').trim();
  const content = (action.content || action.description || '').trim();
  if (!title || !content) {
    return { action_type: action.action_type, ok: false, message: 'Board post needs a title and content.' };
  }

  const { data, error } = await supabase
    .from('board_posts')
    .insert({
      community_id: communityId,
      category_id: category.id,
      author_id: userId,
      title,
      content,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { action_type: action.action_type, ok: false, message: `Could not create board post: ${error?.message || 'unknown error'}` };
  }

  return { action_type: action.action_type, ok: true, message: `Posted "${title}" in ${category.name}.`, ids: [data.id] };
}

async function createActionItem(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const description = (action.description || action.title || action.content || '').trim();
  if (!description) {
    return { action_type: action.action_type, ok: false, message: 'Action item needs a description.' };
  }

  let assignedTo = userId;
  if (action.assignee_name || action.owner_name) {
    const assignee = await findMemberByName(supabase, communityId, action.assignee_name || action.owner_name);
    if (!assignee) {
      return { action_type: action.action_type, ok: false, message: `Could not find assignee "${action.assignee_name || action.owner_name || ''}".` };
    }
    assignedTo = assignee.id;
  }

  const dueDate = action.due_date || action.event_date || null;
  const { data, error } = await supabase
    .from('action_items')
    .insert({
      meeting_id: null,
      community_id: communityId,
      description,
      assigned_to: assignedTo,
      due_date: dueDate,
      completed: false,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { action_type: action.action_type, ok: false, message: `Could not create action item: ${error?.message || 'unknown error'}` };
  }

  return { action_type: action.action_type, ok: true, message: `Created action item "${description}".`, ids: [data.id] };
}

async function markActionItemsComplete(
  supabase: SupabaseClient,
  communityId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const textQuery = normalizeText(action.query || action.title || action.description);
  if (!textQuery) {
    return { action_type: action.action_type, ok: false, message: 'Need search text before marking action items complete.' };
  }

  const { data: items } = await supabase
    .from('action_items')
    .select('id, description, assigned_to, completed, assigned_user:profiles!action_items_assigned_to_fkey(name)')
    .eq('community_id', communityId)
    .eq('completed', false)
    .limit(100);

  const assigneeQuery = normalizedNameQuery(action.assignee_name || action.owner_name);
  const tokens = textQuery.split(' ').filter((token) => token.length > 2);
  const matches = (items || []).filter((item: any) => {
    const haystack = normalizeText(`${item.description} ${item.assigned_user?.name || ''}`);
    const textMatches = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    const assigneeMatches = !assigneeQuery || normalizeText(item.assigned_user?.name || '').includes(assigneeQuery);
    return textMatches && assigneeMatches;
  });

  if (matches.length === 0) {
    return { action_type: action.action_type, ok: false, message: `No open action items matched "${action.query}".` };
  }

  const ids = matches.map((item: any) => item.id);
  const { error } = await supabase
    .from('action_items')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .in('id', ids)
    .eq('community_id', communityId);

  if (error) {
    return { action_type: action.action_type, ok: false, message: `Could not mark action items complete: ${error.message}` };
  }

  return { action_type: action.action_type, ok: true, message: `Marked ${ids.length} action item${ids.length === 1 ? '' : 's'} complete.`, ids };
}

async function markWishesFulfilled(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const textQuery = normalizeText(action.query || action.goal_title || action.description);
  if (!textQuery && !action.owner_name) {
    return { action_type: action.action_type, ok: false, message: 'Need a member or search text before marking wishes fulfilled.' };
  }

  const { data: wishes } = await supabase
    .from('wishes')
    .select('id, description, status, user:profiles!wishes_user_id_fkey(name)')
    .eq('community_id', communityId)
    .neq('status', 'fulfilled')
    .limit(100);

  const ownerQuery = normalizedNameQuery(action.owner_name);
  const tokens = textQuery.split(' ').filter((token) => token.length > 2);
  const matches = (wishes || []).filter((wish: any) => {
    const haystack = normalizeText(`${wish.description} ${wish.user?.name || ''}`);
    const textMatches = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    const ownerMatches = !ownerQuery || normalizeText(wish.user?.name || '').includes(ownerQuery);
    return textMatches && ownerMatches;
  });

  if (matches.length === 0) {
    return { action_type: action.action_type, ok: false, message: `No visible wishes matched "${action.query || action.owner_name || ''}".` };
  }

  const ids = matches.map((wish: any) => wish.id);
  const { error } = await supabase
    .from('wishes')
    .update({
      status: 'fulfilled',
      is_active: false,
      fulfilled_at: new Date().toISOString(),
      fulfilled_by: userId,
      thank_you_message: action.completion_note || null,
    })
    .in('id', ids)
    .eq('community_id', communityId);

  if (error) {
    return { action_type: action.action_type, ok: false, message: `Could not mark wishes fulfilled: ${error.message}` };
  }

  return { action_type: action.action_type, ok: true, message: `Marked ${ids.length} wish${ids.length === 1 ? '' : 'es'} fulfilled.`, ids };
}

async function markHdBoardsComplete(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const categories = await listBoardCategories(supabase, communityId, {
    topic_kind: 'hd_board',
    owner_name: action.owner_name,
    status: 'active',
    limit: 100,
  });
  const target = normalizeText(`${action.board_name || ''} ${action.goal_title || ''} ${action.query || ''}`);
  const tokens = target.split(' ').filter((token) => token.length > 2);
  const matches = categories.filter((category) => {
    const haystack = normalizeText(`${category.name} ${category.goal_title || ''} ${category.description || ''}`);
    return tokens.length === 0 ? !!action.owner_name : tokens.every((token) => haystack.includes(token));
  });

  if (matches.length === 0) {
    return { action_type: action.action_type, ok: false, message: `No active HD boards matched "${action.board_name || action.query || action.owner_name || ''}".` };
  }

  const ids = matches.map((category) => category.id);
  const { error } = await supabase
    .from('board_categories')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: userId,
      completion_note: action.completion_note || null,
    })
    .in('id', ids)
    .eq('community_id', communityId);

  if (error) {
    return { action_type: action.action_type, ok: false, message: `Could not complete HD boards: ${error.message}` };
  }

  return { action_type: action.action_type, ok: true, message: `Marked ${ids.length} HD board${ids.length === 1 ? '' : 's'} complete.`, ids };
}

async function createEvent(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  const title = (action.title || '').trim();
  const eventDate = (action.event_date || '').trim();
  if (!title || !eventDate) {
    return { action_type: action.action_type, ok: false, message: 'Event needs a title and YYYY-MM-DD date.' };
  }

  const { data, error } = await supabase
    .from('events')
    .insert({
      community_id: communityId,
      title,
      description: action.description || action.content || null,
      event_date: eventDate,
      event_time: action.event_time || null,
      location: action.location || null,
      event_type: 'custom',
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { action_type: action.action_type, ok: false, message: `Could not create event: ${error?.message || 'unknown error'}` };
  }

  return { action_type: action.action_type, ok: true, message: `Created event "${title}".`, ids: [data.id] };
}

async function executeAppAction(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
  action: AppAction
): Promise<ActionExecutionResult> {
  switch (action.action_type) {
    case 'create_action_item':
      return createActionItem(supabase, communityId, userId, action);
    case 'create_hd_board':
      return createHdBoard(supabase, communityId, userId, action);
    case 'create_discussion_board':
      return createDiscussionBoard(supabase, communityId, userId, action);
    case 'create_board_post':
      return createBoardPost(supabase, communityId, userId, action);
    case 'mark_action_items_complete':
      return markActionItemsComplete(supabase, communityId, action);
    case 'mark_wishes_fulfilled':
      return markWishesFulfilled(supabase, communityId, userId, action);
    case 'mark_hd_boards_complete':
      return markHdBoardsComplete(supabase, communityId, userId, action);
    case 'create_event':
      return createEvent(supabase, communityId, userId, action);
    default:
      return { action_type: action.action_type, ok: false, message: `Unsupported action type: ${action.action_type}` };
  }
}

async function invalidateActionContext(supabase: SupabaseClient, communityId: string) {
  await supabase
    .from('context_summaries')
    .delete()
    .eq('community_id', communityId)
    .in('summary_type', ['board_activity', 'meetings']);
}

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

    const conversationId = typeof conversation_id === 'string' ? conversation_id.trim() : '';
    if (!conversationId) {
      return errorResponse('Missing conversation_id', 400);
    }

    const { data: conversation, error: conversationError } = await supabaseClient
      .from('conversations')
      .select('id, is_active')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .eq('community_id', communityId)
      .single();

    if (conversationError || !conversation || conversation.is_active === false) {
      return errorResponse('Conversation not found', 404);
    }

    const effectiveMode = mode || 'default';

    if (isQuickSurpriseRequest(message, effectiveMode, refine_wish, attachments)) {
      const quickResponse = getQuickSurpriseResponse();
      return stream ? quickStreamResponse(quickResponse) : quickJsonResponse(quickResponse);
    }
    const quickPlayfulResponse = getQuickPlayfulResponse(message, effectiveMode, refine_wish, attachments);
    if (quickPlayfulResponse) {
      return stream ? quickStreamResponse(quickPlayfulResponse) : quickJsonResponse(quickPlayfulResponse);
    }

    // Build comprehensive context using the smart context builder
    const contextResult = await buildContext({
      supabase: supabaseClient,
      userId,
      communityId,
      conversationId,
      mode: effectiveMode,
    });

    // Check if this is a wish refinement request (refine_wish contains the rough wish)
    const isRefineWish = !!refine_wish;

    // Select the appropriate system prompt based on mode
    let systemPrompt = SYSTEM_PROMPT;
    if (isRefineWish) {
      // Use the refine wish prompt with the rough wish inserted
      systemPrompt = REFINE_WISH_PROMPT.replace('{rough_wish}', refine_wish);
    } else if (effectiveMode === 'onboarding' && context === 'skills') {
      systemPrompt = ONBOARDING_SKILLS_PROMPT;
    } else if (effectiveMode === 'onboarding' && context === 'wishes') {
      systemPrompt = ONBOARDING_WISHES_PROMPT;
    } else if (effectiveMode === 'onboarding' && !context) {
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
      const imageAttachments = attachments.filter((attachment: any) => attachment.mime_type?.startsWith('image/'));
      const fileAttachments = attachments.filter((attachment: any) => !attachment.mime_type?.startsWith('image/'));

      // Add image blocks
      for (const attachment of imageAttachments) {
        contentBlocks.push({
          type: 'image' as const,
          source: {
            type: 'url' as const,
            url: attachment.url,
          },
        });
      }

      const fileSummary = fileAttachments
        .map((attachment: any, index: number) => {
          const name = attachment.filename || `File ${index + 1}`;
          const type = attachment.mime_type || 'unknown type';
          const preview = typeof attachment.text_preview === 'string' && attachment.text_preview.trim()
            ? `\nPreview:\n${attachment.text_preview}${attachment.text_preview_truncated ? '\n[Preview truncated]' : ''}`
            : '';
          return `${index + 1}. ${name} (${type}) - ${attachment.url}${preview}`;
        })
        .join('\n');
      const fallbackMessage = imageAttachments.length > 0
        ? 'What do you see in this image?'
        : 'Please review the attached file.';
      const messageWithFileContext = fileSummary
        ? `${message || fallbackMessage}\n\nAttached files:\n${fileSummary}`
        : (message || fallbackMessage);

      // Add text block (even if empty, Claude needs at least the text block)
      contentBlocks.push({
        type: 'text' as const,
        text: messageWithFileContext,
      });

      messages.push({ role: 'user' as const, content: contentBlocks });
    } else {
      messages.push({ role: 'user' as const, content: message });
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const chatModel = selectChatModel(message, refine_wish);

    let response = await anthropic.messages.create({
      model: chatModel,
      max_tokens: CHAT_MAX_TOKENS,
      system: `${systemPrompt}\n\n${contextInfo}`,
      tools,
      messages
    });

    let skillsAdded = 0;
    let onboardingComplete = false;
    let proposedActionsThisTurn = false;

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
              status: 'public',
              is_active: true,
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
            result = error ? `Error: ${error.message}` : 'Wish published to HIVE';
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

          case 'get_meeting_summaries': {
            const input = toolUse.input as { limit?: number; include_transcript?: boolean };
            const limit = Math.min(Math.max(Number(input.limit) || 1, 1), 5);
            const includeTranscript = input.include_transcript !== false;
            const { data: meetingRows } = await supabaseClient
              .from('meetings')
              .select('id, date, summary, transcript_attributed, transcript_raw, processing_status')
              .eq('community_id', communityId)
              .order('date', { ascending: false })
              .limit(limit);
            const summaries = (meetingRows ?? []).map((meeting, index) => {
              let parsedSummary: unknown = meeting.summary;
              try {
                parsedSummary = JSON.parse(meeting.summary ?? '');
              } catch { /* plain-text summary */ }
              const transcript = includeTranscript && index === 0
                ? (meeting.transcript_attributed || meeting.transcript_raw || '').slice(0, 12000)
                : undefined;
              return {
                date: meeting.date,
                processing_status: meeting.processing_status,
                summary: parsedSummary,
                notes: transcript,
              };
            });
            result = JSON.stringify(summaries);
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
            result = 'Onboarding marked as complete. The user can now enter HIVE!';
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
            const { query, category, author_name, owner_name, limit: requestedLimit } = toolUse.input as {
              query?: string;
              category?: string;
              author_name?: string;
              owner_name?: string;
              limit?: number;
            };
            const postLimit = Math.min(requestedLimit || 10, 20);
            const fetchLimit = query || category || author_name || owner_name ? 100 : postLimit;

            let postQuery = supabaseClient
              .from('board_posts')
              .select(`
                id,
                title,
                content,
                is_pinned,
                reply_count,
                created_at,
                category:board_categories(name, category_type, topic_kind, goal_title, owner:profiles!board_categories_owner_user_id_fkey(name)),
                author:profiles!board_posts_author_id_fkey(name)
              `)
              .eq('community_id', communityId)
              .order('is_pinned', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(fetchLimit);

            const { data: posts, error: postsError } = await postQuery;

            if (postsError) {
              result = `Error searching posts: ${postsError.message}`;
              break;
            }

            const repliesByPost = new Map<string, any[]>();
            const postIds = (posts || []).map((post: any) => post.id).filter(Boolean);
            if (postIds.length > 0) {
              const { data: replies } = await supabaseClient
                .from('board_replies')
                .select('post_id, content, created_at, author:profiles!board_replies_author_id_fkey(name)')
                .in('post_id', postIds)
                .order('created_at', { ascending: true })
                .limit(200);

              (replies || []).forEach((reply: any) => {
                const existing = repliesByPost.get(reply.post_id) || [];
                existing.push(reply);
                repliesByPost.set(reply.post_id, existing);
              });
            }

            let filteredPosts = posts || [];
            if (query) {
              filteredPosts = filteredPosts.filter((p: any) => {
                const replies = repliesByPost.get(p.id) || [];
                return matchesSearchQuery([
                  p.title,
                  p.content,
                  p.category?.name,
                  p.category?.goal_title,
                  p.category?.owner?.name,
                  p.author?.name,
                  ...replies.map((reply: any) => `${reply.content || ''} ${reply.author?.name || ''}`),
                ], query);
              });
            }

            if (category) {
              filteredPosts = filteredPosts.filter((p: any) =>
                matchesSearchQuery([p.category?.name, p.category?.goal_title, p.category?.owner?.name], category)
              );
            }

            if (author_name) {
              filteredPosts = filteredPosts.filter((p: any) =>
                matchesSearchQuery([p.author?.name], author_name)
              );
            }

            if (owner_name) {
              filteredPosts = filteredPosts.filter((p: any) =>
                matchesSearchQuery([p.category?.owner?.name, p.category?.name, p.category?.goal_title], owner_name)
              );
            }

            const formattedPosts = filteredPosts.slice(0, postLimit).map((p: any) => {
              const replies = repliesByPost.get(p.id) || [];
              const matchingReplies = query
                ? replies
                    .filter((reply: any) => matchesSearchQuery([reply.content, reply.author?.name], query))
                    .slice(0, 2)
                    .map((reply: any) => ({
                      content_snippet: (reply.content || '').substring(0, 160) + ((reply.content || '').length > 160 ? '...' : ''),
                      author: reply.author?.name || 'Unknown',
                      created_at: reply.created_at,
                    }))
                : [];

              return {
                id: p.id,
                title: p.title,
                content_snippet: (p.content || '').substring(0, 200) + ((p.content || '').length > 200 ? '...' : ''),
                author: p.author?.name || 'Unknown',
                category: p.category?.name || 'General',
                board_type: p.category?.topic_kind || 'discussion',
                goal: p.category?.goal_title || null,
                owner: p.category?.owner?.name || null,
                is_pinned: p.is_pinned,
                reply_count: p.reply_count || 0,
                created_at: p.created_at,
                matching_replies: matchingReplies,
              };
            });

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
                category:board_categories(name, category_type, topic_kind, goal_title, owner:profiles!board_categories_owner_user_id_fkey(name)),
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
              board_type: (post.category as any)?.topic_kind || 'discussion',
              goal: (post.category as any)?.goal_title || null,
              owner: (post.category as any)?.owner?.name || null,
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

          case 'get_board_categories': {
            const input = toolUse.input as {
              query?: string;
              topic_kind?: string;
              owner_name?: string;
              status?: string;
              limit?: number;
            };
            const categories = await listBoardCategories(supabaseClient, communityId, input);
            result = JSON.stringify(categories.map((category) => ({
              id: category.id,
              name: category.name,
              description: category.description,
              board_type: category.topic_kind || 'discussion',
              goal: category.goal_title || null,
              owner: category.owner?.name || null,
              status: category.status || 'active',
            })));
            break;
          }

          case 'search_action_items': {
            const {
              query,
              assignee_name,
              completed,
              limit: requestedLimit,
            } = toolUse.input as {
              query?: string;
              assignee_name?: string;
              completed?: boolean;
              limit?: number;
            };
            const itemLimit = Math.min(requestedLimit || 20, 50);
            let itemQuery = supabaseClient
              .from('action_items')
              .select('id, description, due_date, completed, completed_at, assigned_user:profiles!action_items_assigned_to_fkey(name)')
              .eq('community_id', communityId)
              .order('created_at', { ascending: false })
              .limit(itemLimit);
            if (typeof completed === 'boolean') itemQuery = itemQuery.eq('completed', completed);
            if (query) itemQuery = itemQuery.ilike('description', `%${query}%`);

            const { data: actionItems, error: actionItemsError } = await itemQuery;
            if (actionItemsError) {
              result = `Error searching action items: ${actionItemsError.message}`;
              break;
            }

            const assigneeQuery = normalizedNameQuery(assignee_name);
            const filtered = assigneeQuery
              ? (actionItems || []).filter((item: any) => normalizeText(item.assigned_user?.name || '').includes(assigneeQuery))
              : (actionItems || []);
            result = JSON.stringify(filtered.map((item: any) => ({
              id: item.id,
              description: item.description,
              assignee: item.assigned_user?.name || null,
              due_date: item.due_date || null,
              completed: item.completed,
              completed_at: item.completed_at || null,
            })));
            break;
          }

          case 'search_wishes': {
            const {
              query,
              member_name,
              status,
              limit: requestedLimit,
            } = toolUse.input as {
              query?: string;
              member_name?: string;
              status?: string;
              limit?: number;
            };
            const wishLimit = Math.min(requestedLimit || 20, 50);
            const wishFetchLimit = query || member_name ? 100 : wishLimit;
            let wishQuery = supabaseClient
              .from('wishes')
              .select('id, user_id, description, status, is_active, created_at, fulfilled_at, user:profiles!wishes_user_id_fkey(name)')
              .eq('community_id', communityId)
              .or(`status.in.(public,fulfilled),user_id.eq.${userId}`)
              .order('created_at', { ascending: false })
              .limit(wishFetchLimit);
            if (status) wishQuery = wishQuery.eq('status', status);

            const { data: wishes, error: wishesError } = await wishQuery;
            if (wishesError) {
              result = `Error searching wishes: ${wishesError.message}`;
              break;
            }

            let filtered = wishes || [];
            if (query) {
              filtered = filtered.filter((wish: any) =>
                matchesSearchQuery([wish.description, wish.user?.name], query)
              );
            }

            if (member_name) {
              filtered = filtered.filter((wish: any) =>
                matchesSearchQuery([wish.user?.name], member_name)
              );
            }

            result = JSON.stringify(filtered.slice(0, wishLimit).map((wish: any) => ({
              id: wish.id,
              description: wish.description,
              owner: wish.user?.name || null,
              status: wish.status,
              is_active: wish.is_active,
              created_at: wish.created_at,
              fulfilled_at: wish.fulfilled_at || null,
            })));
            break;
          }

          case 'propose_app_actions': {
            const { summary, actions } = toolUse.input as {
              summary: string;
              actions: AppAction[];
            };
            const actionPlan = Array.isArray(actions) ? actions : [];
            const { data: requestRow, error } = await supabaseClient
              .from('agent_action_requests')
              .insert({
                community_id: communityId,
                user_id: userId,
                conversation_id: conversationId,
                summary,
                action_plan: actionPlan,
                status: 'pending',
              })
              .select('id, summary, action_plan')
              .single();

            if (error || !requestRow) {
              result = `Error creating pending action proposal: ${error?.message || 'unknown error'}`;
              break;
            }

            proposedActionsThisTurn = true;
            result = JSON.stringify({
              request_id: requestRow.id,
              status: 'pending',
              summary: requestRow.summary,
              actions: actionPlan.map(actionSummary),
              next_step: 'Ask the user to say "apply it" or "yes, do it" before applying these changes.',
            });
            break;
          }

          case 'apply_pending_actions': {
            const { request_id } = toolUse.input as { request_id?: string };
            if (proposedActionsThisTurn) {
              result = 'Not applied: a proposal was created in this response. Ask the user to confirm in a new message before applying it.';
              break;
            }
            if (!hasExplicitApproval(message)) {
              result = 'Not applied: the latest user message did not clearly approve the pending app changes.';
              break;
            }

            let requestQuery = supabaseClient
              .from('agent_action_requests')
              .select('id, summary, action_plan')
              .eq('community_id', communityId)
              .eq('user_id', userId)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(1);

            if (request_id) {
              requestQuery = requestQuery.eq('id', request_id);
            } else {
              requestQuery = requestQuery.eq('conversation_id', conversationId);
            }

            let { data: pendingRows, error: pendingError } = await requestQuery;
            if ((!pendingRows || pendingRows.length === 0) && !request_id) {
              const fallback = await supabaseClient
                .from('agent_action_requests')
                .select('id, summary, action_plan')
                .eq('community_id', communityId)
                .eq('user_id', userId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1);
              pendingRows = fallback.data;
              pendingError = fallback.error;
            }

            const pending = pendingRows?.[0];
            if (pendingError || !pending) {
              result = pendingError
                ? `Could not load pending action proposal: ${pendingError.message}`
                : 'No pending action proposal found to apply.';
              break;
            }

            const actionPlan = Array.isArray(pending.action_plan) ? pending.action_plan as AppAction[] : [];
            const executionResults: ActionExecutionResult[] = [];
            for (const action of actionPlan) {
              executionResults.push(await executeAppAction(supabaseClient, communityId, userId, action));
            }

            await invalidateActionContext(supabaseClient, communityId);
            const allOk = executionResults.every((executionResult) => executionResult.ok);
            await supabaseClient
              .from('agent_action_requests')
              .update({
                status: allOk ? 'applied' : 'failed',
                result: executionResults,
                applied_at: new Date().toISOString(),
              })
              .eq('id', pending.id)
              .eq('user_id', userId)
              .eq('community_id', communityId);

            result = JSON.stringify({
              request_id: pending.id,
              status: allOk ? 'applied' : 'failed',
              summary: pending.summary,
              results: executionResults,
            });
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
        model: chatModel,
        max_tokens: CHAT_MAX_TOKENS,
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

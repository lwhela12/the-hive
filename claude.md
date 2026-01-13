# The Hive - AI-Powered Wish Coordination App

## Project Overview

The Hive is a mobile + web application for a 12-person community that practices "high-definition wishing" - a framework where AI helps people articulate what they actually want beneath surface-level desires, then matches wishes to the skills and capabilities of other community members.

### Core Philosophy

1. **High-Definition Wishing**: Vague desires ("I want to be healthier") get refined through AI conversation into actionable wishes ("I want someone to teach me three 20-minute meals I can meal-prep on Sundays")

2. **Asymmetry Preserves the Engine**: Wishing feels vulnerable, granting feels powerful. The system leverages this - everyone wants to be the fairy godmother.

3. **Floors, Not Ceilings**: People specify "enough" (what I need), not "maximum" (what I can extract).

4. **Queen Bee Month**: Each member gets one month where the community focuses energy on their project/wishes. This solves the cold-start problem for a small group.

5. **The Agent is Always Listening**: Every conversation is an opportunity to surface latent wishes. The chat interface is primary; the "board" of wishes is the refined output.

---

## Tech Stack

### Core
- **Framework**: Expo (React Native) - single codebase for iOS + Web
- **Language**: TypeScript
- **Backend**: Supabase (Auth, Database, Storage, Realtime, Edge Functions)
- **AI**: Claude API with tool use
- **Styling**: NativeWind (Tailwind for React Native)

### Integrations
- **Auth**: Google OAuth via Supabase
- **Calendar**: Google Calendar API (read/write sync)
- **Transcription**: AssemblyAI (with speaker diarization)
- **Email**: Resend
- **Hosting**: Vercel (web), Expo EAS (iOS builds)

### Why These Choices
- Expo: Single codebase → iOS App Store + Web. Excellent audio recording support. Expo Go for instant testing.
- Supabase: Auth + DB + Storage + Realtime in one. Generous free tier. Row-level security for privacy.
- NativeWind: Familiar Tailwind syntax, works on both native and web.

---

## Project Structure

```
hive-app/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/                   # Auth group (login, etc.)
│   │   └── login.tsx
│   ├── (app)/                    # Authenticated app group
│   │   ├── _layout.tsx           # Tab navigator
│   │   ├── index.tsx             # Main chat interface
│   │   ├── hive.tsx              # "Check on the Hive" view
│   │   ├── meetings.tsx          # Meeting history
│   │   ├── profile.tsx           # User profile/settings
│   │   └── admin.tsx             # Admin panel (role-gated)
│   ├── onboarding/               # Onboarding flow
│   │   ├── welcome.tsx
│   │   ├── info.tsx
│   │   ├── skills.tsx
│   │   └── wishes.tsx
│   └── _layout.tsx               # Root layout
├── components/
│   ├── chat/
│   │   ├── ChatInterface.tsx     # Main chat component
│   │   ├── MessageBubble.tsx
│   │   └── TypingIndicator.tsx
│   ├── hive/
│   │   ├── QueenBeeCard.tsx
│   │   ├── WishCard.tsx
│   │   ├── WishBoard.tsx
│   │   └── HoneyPotDisplay.tsx
│   ├── meetings/
│   │   ├── AudioRecorder.tsx
│   │   ├── MeetingSummary.tsx
│   │   └── ActionItemList.tsx
│   ├── calendar/
│   │   └── EventList.tsx
│   └── ui/                       # Shared UI components
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Input.tsx
│       └── Avatar.tsx
├── lib/
│   ├── supabase.ts               # Supabase client
│   ├── claude.ts                 # Claude API client with tools
│   ├── assemblyai.ts             # Transcription client
│   ├── google-calendar.ts        # Calendar sync
│   ├── notifications.ts          # Email via Resend
│   └── hooks/
│       ├── useUser.ts
│       ├── useChat.ts
│       ├── useWishes.ts
│       └── useQueenBee.ts
├── types/
│   └── index.ts                  # TypeScript types matching DB schema
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       ├── chat/                 # Claude chat endpoint
│       ├── transcribe/           # AssemblyAI webhook handler
│       └── notify/               # Email notifications
├── assets/
├── app.json                      # Expo config
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Database Schema

Use this SQL to initialize Supabase:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ENUM types
create type user_role as enum ('member', 'treasurer', 'admin');
create type wish_status as enum ('private', 'public', 'fulfilled', 'replaced');
create type queen_bee_status as enum ('upcoming', 'active', 'completed');
create type event_type as enum ('meeting', 'queen_bee', 'birthday', 'custom');
create type notification_type as enum ('wish_match', 'meeting_summary', 'queen_bee_update', 'action_item', 'general');
create type extraction_source as enum ('chat', 'onboarding', 'meeting', 'manual');

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  phone text,
  preferred_contact text default 'email',
  birthday date,
  role user_role default 'member',
  queen_bee_month text, -- Format: '2025-03'
  google_calendar_id text,
  google_refresh_token text, -- Encrypted
  avatar_url text,
  onboarded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Skills (user capabilities, HD articulated)
create table public.skills (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  description text not null, -- HD articulated version
  raw_input text, -- What they originally said
  extracted_from extraction_source default 'chat',
  created_at timestamptz default now()
);

-- Wishes
create table public.wishes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  description text not null, -- HD articulated version
  raw_input text, -- Original problem/desire
  status wish_status default 'private',
  is_active boolean default false, -- Only one active public wish per user
  extracted_from extraction_source default 'chat',
  fulfilled_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  fulfilled_at timestamptz,
  replaced_at timestamptz
);

-- Queen Bee periods
create table public.queen_bees (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  month text not null unique, -- Format: '2025-03'
  project_title text not null,
  project_description text,
  status queen_bee_status default 'upcoming',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Queen Bee updates (from QB or other members)
create table public.queen_bee_updates (
  id uuid default uuid_generate_v4() primary key,
  queen_bee_id uuid references public.queen_bees(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- Meetings
create table public.meetings (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  audio_url text, -- Supabase Storage path
  transcript_raw text, -- Full text with speaker labels
  transcript_attributed text, -- Cleaned with names
  summary text, -- AI-generated
  recorded_by uuid references public.profiles(id),
  processing_status text default 'pending', -- pending, transcribing, summarizing, complete, failed
  created_at timestamptz default now()
);

-- Meeting action items
create table public.action_items (
  id uuid default uuid_generate_v4() primary key,
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  description text not null,
  assigned_to uuid references public.profiles(id),
  due_date date,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Honey Pot (community fund)
create table public.honey_pot (
  id uuid default uuid_generate_v4() primary key,
  balance decimal(10,2) default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- Honey Pot transactions
create table public.honey_pot_transactions (
  id uuid default uuid_generate_v4() primary key,
  amount decimal(10,2) not null,
  transaction_type text not null, -- 'deposit', 'withdrawal', 'adjustment'
  note text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Calendar events
create table public.events (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  event_date date not null,
  event_time time,
  event_type event_type default 'custom',
  google_event_id text, -- For sync
  related_user_id uuid references public.profiles(id), -- For birthdays
  related_queen_bee_id uuid references public.queen_bees(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Notifications
create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  notification_type notification_type not null,
  title text not null,
  content text,
  related_wish_id uuid references public.wishes(id),
  related_meeting_id uuid references public.meetings(id),
  related_action_item_id uuid references public.action_items(id),
  read_at timestamptz,
  email_sent boolean default false,
  created_at timestamptz default now()
);

-- Chat history (for context)
create table public.chat_messages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null, -- 'user' or 'assistant'
  content text not null,
  tool_calls jsonb, -- Store any tool calls made
  created_at timestamptz default now()
);

-- Row Level Security Policies
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.wishes enable row level security;
alter table public.queen_bees enable row level security;
alter table public.queen_bee_updates enable row level security;
alter table public.meetings enable row level security;
alter table public.action_items enable row level security;
alter table public.honey_pot enable row level security;
alter table public.honey_pot_transactions enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles: Users can read all, update own
create policy "Profiles are viewable by authenticated users" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Skills: Users can read all, manage own
create policy "Skills are viewable by authenticated users" on public.skills
  for select using (auth.role() = 'authenticated');
create policy "Users can insert own skills" on public.skills
  for insert with check (auth.uid() = user_id);
create policy "Users can update own skills" on public.skills
  for update using (auth.uid() = user_id);

-- Wishes: Users can read public wishes and own private wishes
create policy "Users can read public wishes" on public.wishes
  for select using (status = 'public' or auth.uid() = user_id);
create policy "Users can manage own wishes" on public.wishes
  for all using (auth.uid() = user_id);

-- Queen Bees: All authenticated can read, admins can manage
create policy "Queen bees viewable by all" on public.queen_bees
  for select using (auth.role() = 'authenticated');
create policy "Admins can manage queen bees" on public.queen_bees
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Queen Bee Updates: All can read, authenticated can insert
create policy "QB updates viewable by all" on public.queen_bee_updates
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can add QB updates" on public.queen_bee_updates
  for insert with check (auth.role() = 'authenticated');

-- Meetings: All authenticated can read and manage
create policy "Meetings viewable by all" on public.meetings
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can manage meetings" on public.meetings
  for all using (auth.role() = 'authenticated');

-- Action Items: All can read, assigned user or admin can update
create policy "Action items viewable by all" on public.action_items
  for select using (auth.role() = 'authenticated');
create policy "Assigned user can update action items" on public.action_items
  for update using (auth.uid() = assigned_to);

-- Honey Pot: All can read, treasurer can manage
create policy "Honey pot viewable by all" on public.honey_pot
  for select using (auth.role() = 'authenticated');
create policy "Treasurer can update honey pot" on public.honey_pot
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('treasurer', 'admin'))
  );

-- Honey Pot Transactions: All can read, treasurer can insert
create policy "Transactions viewable by all" on public.honey_pot_transactions
  for select using (auth.role() = 'authenticated');
create policy "Treasurer can add transactions" on public.honey_pot_transactions
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('treasurer', 'admin'))
  );

-- Events: All can read and manage
create policy "Events viewable by all" on public.events
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can manage events" on public.events
  for all using (auth.role() = 'authenticated');

-- Notifications: Users can only see own
create policy "Users see own notifications" on public.notifications
  for select using (auth.uid() = user_id);
create policy "System can create notifications" on public.notifications
  for insert with check (true); -- Edge functions handle creation

-- Chat Messages: Users can only see own
create policy "Users see own chat history" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "Users can insert own messages" on public.chat_messages
  for insert with check (auth.uid() = user_id);

-- Initialize honey pot with single row
insert into public.honey_pot (balance) values (0);

-- Function to ensure only one active public wish per user
create or replace function check_active_wish()
returns trigger as $$
begin
  if NEW.status = 'public' and NEW.is_active = true then
    update public.wishes 
    set is_active = false, status = 'replaced', replaced_at = now()
    where user_id = NEW.user_id 
      and id != NEW.id 
      and is_active = true;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger ensure_single_active_wish
  before insert or update on public.wishes
  for each row execute function check_active_wish();

-- Function to auto-create birthday events
create or replace function create_birthday_event()
returns trigger as $$
begin
  if NEW.birthday is not null and (OLD.birthday is null or OLD.birthday != NEW.birthday) then
    -- Delete existing birthday event for this user
    delete from public.events where related_user_id = NEW.id and event_type = 'birthday';
    -- Create new birthday event
    insert into public.events (title, event_date, event_type, related_user_id)
    values (
      NEW.name || '''s Birthday',
      NEW.birthday,
      'birthday',
      NEW.id
    );
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger auto_birthday_event
  after insert or update on public.profiles
  for each row execute function create_birthday_event();
```

---

## Claude Agent Configuration

The chat agent is the heart of the application. It should feel like a helpful friend who happens to have perfect memory and can take action.

### System Prompt

```
You are the Hive Assistant, an AI helper for a close-knit community of 12 people practicing "high-definition wishing."

Your primary role is to help users articulate what they actually want. People often express vague desires ("I want to be healthier") or surface-level wants ("I want a new car"). Your job is to help them discover the underlying desire through curious, gentle questioning.

## Core Behaviors

1. **Always be conversational first.** You're not a form to fill out. Chat naturally. Let wishes and skills emerge organically.

2. **Listen for latent wishes.** When someone says "I'm having a rough day" - that might lead to a wish. When they say "I wish someone could help me with X" - that's definitely a wish. Probe gently.

3. **High-definition means specific and actionable.** 
   - Low definition: "I want to learn to cook"
   - High definition: "I want someone to teach me 3 easy weeknight dinners I can make in under 30 minutes, starting with pasta dishes"

4. **Never push wishes public.** When a wish is well-articulated, ASK if they want to share it with the Hive. Respect if they say no.

5. **You have tools.** Use them naturally. Don't announce "I'm going to use my store_skill tool now." Just do it and confirm conversationally: "Got it, I've noted that you're great at [skill]."

6. **You know the community.** You can see everyone's public wishes and skills. When relevant, mention potential matches: "You know, Sarah mentioned she's been wanting to learn exactly that..."

7. **The Queen Bee is special.** The current Queen Bee's project takes priority. Look for ways to help their project through the conversation.

8. **Consolidation over accumulation.** Help users refine and combine wishes rather than accumulating a long list. Quality over quantity.

## Conversation Starters

If the user seems unsure what to talk about:
- "How's your week going? Anything on your mind?"
- "I was thinking about your wish for [X] - any progress or changes?"
- "Did you know [Queen Bee] is working on [project]? Any thoughts on how you might help?"

## What NOT to Do

- Don't be sycophantic or overly enthusiastic
- Don't lecture about the "high definition wishing framework" 
- Don't create wishes without the user's explicit involvement
- Don't share private wishes with others
- Don't make the user feel like they're being processed
```

### Agent Tools

Define these tools for Claude's function calling:

```typescript
const agentTools = [
  {
    name: "store_skill",
    description: "Store a skill/capability that the user has mentioned they possess. Use this when a user describes something they're good at or enjoy doing. The skill should be stored in high-definition (specific, actionable).",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "The HD-articulated skill description"
        },
        raw_input: {
          type: "string", 
          description: "What the user originally said"
        }
      },
      required: ["description", "raw_input"]
    }
  },
  {
    name: "store_wish",
    description: "Store a wish that has emerged from conversation. Only use when the wish is reasonably well-articulated. Wishes start as private.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "The HD-articulated wish"
        },
        raw_input: {
          type: "string",
          description: "The original problem or desire expressed"
        }
      },
      required: ["description", "raw_input"]
    }
  },
  {
    name: "publish_wish",
    description: "Make a wish public to the Hive. Only call this after explicit user confirmation. This replaces any existing active public wish.",
    input_schema: {
      type: "object",
      properties: {
        wish_id: {
          type: "string",
          description: "The UUID of the wish to publish"
        }
      },
      required: ["wish_id"]
    }
  },
  {
    name: "get_user_wishes",
    description: "Retrieve the current user's wishes (both private and public)",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_user_skills",
    description: "Retrieve the current user's stored skills",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_public_wishes",
    description: "Get all public wishes from other Hive members. Use to find matches or inform the user about community needs.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_all_skills",
    description: "Get all skills from all Hive members. Use to find potential matches for wishes.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_current_queen_bee",
    description: "Get information about the current Queen Bee and their project",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "add_queen_bee_update",
    description: "Add an update/note to the current Queen Bee's project",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The update content"
        }
      },
      required: ["content"]
    }
  },
  {
    name: "get_upcoming_events",
    description: "Get upcoming calendar events for the Hive",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of events to retrieve (default 5)"
        }
      }
    }
  },
  {
    name: "get_honey_pot",
    description: "Get the current Honey Pot balance",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "check_wish_matches",
    description: "Find Hive members whose skills might match a specific wish",
    input_schema: {
      type: "object",
      properties: {
        wish_description: {
          type: "string",
          description: "The wish to find matches for"
        }
      },
      required: ["wish_description"]
    }
  },
  {
    name: "get_hive_members",
    description: "Get list of all Hive members with basic info",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "fulfill_wish",
    description: "Mark a wish as fulfilled. Use when user confirms their wish has been granted.",
    input_schema: {
      type: "object",
      properties: {
        wish_id: {
          type: "string",
          description: "The wish ID to mark fulfilled"
        },
        fulfilled_by: {
          type: "string",
          description: "User ID of who fulfilled it (optional)"
        }
      },
      required: ["wish_id"]
    }
  }
];
```

---

## User Flows

### Flow 1: First-Time Onboarding

```
1. User clicks "Sign in with Google"
2. Google OAuth → Supabase creates auth.users entry
3. Check if profiles entry exists
   - If yes: redirect to main app
   - If no: redirect to /onboarding/welcome

4. /onboarding/welcome
   - "Welcome to The Hive! Let's get you set up."
   - [Continue]

5. /onboarding/info
   - Name (pre-filled from Google)
   - Phone (optional)
   - Birthday
   - Preferred contact method
   - [Continue]

6. /onboarding/skills
   - Chat interface with agent
   - Agent: "What are some things you feel you're particularly good at? Things you enjoy doing, especially around creating or problem-solving?"
   - Natural conversation extracts skills
   - Agent uses store_skill tool as skills emerge
   - After a few skills captured: "Great! Ready to move on?" 
   - [Continue]

7. /onboarding/wishes  
   - Chat continues
   - Agent: "Now, what are you working on these days? Anything you might need help with? This stays private unless you choose to share."
   - Natural conversation extracts initial wishes (stored as private)
   - Agent: "Perfect. You can always refine these later. Welcome to The Hive!"
   - [Enter The Hive]

8. Create profile with onboarded_at = now()
9. Redirect to main chat
```

### Flow 2: Daily Chat Usage

```
1. User opens app → main chat interface
2. Greeting: "Hey [Name]! How can I help today?"
3. User chats naturally
4. Agent:
   - Responds conversationally
   - Probes toward HD wishes when relevant
   - Uses tools silently to store/retrieve
   - Mentions relevant community context
5. When a wish crystallizes:
   - Agent: "That sounds like a clear wish: '[description]'. Want me to share this with the Hive? It might match someone's skills."
   - If yes: publish_wish, notify relevant members
   - If no: stays private, can revisit later
```

### Flow 3: Check on the Hive

```
1. User taps "Hive" tab
2. View shows:
   - Current Queen Bee card (name, photo, project, recent update)
   - "Public Wishes" section (one per member who has one)
   - "You Might Help With" section (wishes matching user's skills)
   - Calendar preview (next 3 events)
   - Honey Pot balance
3. Tapping a wish shows detail + "I can help" button
4. Tapping Queen Bee shows full project + all updates + add update
```

### Flow 4: Record a Meeting

```
1. Admin/any member opens Meetings tab
2. Tap "Record Meeting"
3. Audio recording starts (MediaRecorder API / Expo AV)
4. Recording indicator visible
5. Tap "End Recording"
6. Upload modal:
   - Date (auto-filled)
   - [Upload & Transcribe]
7. Audio uploads to Supabase Storage
8. Edge function triggers AssemblyAI
9. AssemblyAI webhook returns transcript
10. Claude summarizes:
    - Summary paragraph
    - Action items extracted (with assigned person if mentioned)
    - Queen Bee updates extracted
    - Any wishes that surfaced
11. Admin reviews/edits summary
12. Published to meeting history
13. Notifications sent for action items
```

### Flow 5: Admin Actions

```
Admin Panel shows:
1. Set Queen Bee
   - Select member
   - Select month
   - Enter project title/description
   - [Save]

2. Manage Calendar
   - Add event (title, date, time, type)
   - Sync with Google Calendar
   - Edit/delete events

3. Member Management
   - View all members
   - Assign roles (member/treasurer/admin)
   - Resend invites

4. Meeting Management
   - Edit transcripts/summaries
   - Manage action items
```

---

## API Integration Details

### Google Calendar

```typescript
// lib/google-calendar.ts

// Scopes needed
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];

// Store refresh token in profiles.google_refresh_token (encrypted)

// Sync events FROM Google Calendar
async function syncFromGoogle(userId: string) {
  // Fetch events from user's primary calendar
  // Upsert to events table with google_event_id
}

// Push events TO Google Calendar
async function pushToGoogle(userId: string, event: Event) {
  // Create event in user's calendar
  // Store google_event_id in our events table
}

// Create shared Hive calendar
// All members subscribe to this calendar
// Events pushed there are visible to all
```

### AssemblyAI Transcription

```typescript
// lib/assemblyai.ts

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

async function transcribeAudio(audioUrl: string): Promise<string> {
  // 1. Submit for transcription with speaker_labels: true
  const response = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'Authorization': ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true
    })
  });
  
  const { id } = await response.json();
  
  // 2. Poll for completion or use webhook
  // 3. Return transcript with speaker labels
  // Format: "Speaker A: Hello everyone...\nSpeaker B: Thanks for..."
}

// Webhook handler in Edge Function
// POST /functions/v1/transcribe-webhook
```

### Email Notifications

```typescript
// lib/notifications.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWishMatchNotification(
  to: string,
  matchedWish: Wish,
  wisher: Profile
) {
  await resend.emails.send({
    from: 'The Hive <hive@yourdomain.com>',
    to,
    subject: `🐝 Your skills might help ${wisher.name}!`,
    html: `
      <h2>A wish you might be able to grant</h2>
      <p><strong>${wisher.name}</strong> is wishing for:</p>
      <blockquote>${matchedWish.description}</blockquote>
      <p>Think you can help? Open The Hive to connect.</p>
    `
  });
}

// Similar functions for:
// - sendActionItemNotification
// - sendMeetingSummaryNotification  
// - sendQueenBeeUpdateNotification
```

---

## Key Implementation Notes

### Chat Context Management

The agent needs context to be helpful. On each message, include:
- Last 20 messages from chat_messages table
- User's current skills
- User's current wishes (private + public)
- Current Queen Bee info
- User's assigned action items

```typescript
async function buildChatContext(userId: string) {
  const [messages, skills, wishes, queenBee, actionItems] = await Promise.all([
    getRecentMessages(userId, 20),
    getUserSkills(userId),
    getUserWishes(userId),
    getCurrentQueenBee(),
    getUserActionItems(userId)
  ]);
  
  return `
## Your Skills
${skills.map(s => `- ${s.description}`).join('\n')}

## Your Wishes
${wishes.map(w => `- [${w.status}] ${w.description}`).join('\n')}

## Current Queen Bee
${queenBee.user.name} - ${queenBee.project_title}
${queenBee.project_description}

## Your Action Items
${actionItems.map(a => `- ${a.description} (due: ${a.due_date})`).join('\n')}

## Recent Conversation
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}
`;
}
```

### Matching Algorithm

For `check_wish_matches`, use Claude to semantically match:

```typescript
async function findMatches(wishDescription: string) {
  const allSkills = await getAllSkills();
  
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: "You match wishes to skills. Return JSON array of matches with confidence scores.",
    messages: [{
      role: 'user',
      content: `
        Wish: "${wishDescription}"
        
        Available skills:
        ${allSkills.map(s => `- ${s.user.name}: ${s.description}`).join('\n')}
        
        Return matches as JSON: [{ "userId": "...", "skillId": "...", "confidence": 0.8, "reason": "..." }]
        Only include matches with confidence > 0.6
      `
    }]
  });
  
  return JSON.parse(response.content[0].text);
}
```

### Audio Recording (Expo)

```typescript
// components/meetings/AudioRecorder.tsx
import { Audio } from 'expo-av';

async function startRecording() {
  await Audio.requestPermissionsAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  
  return recording;
}

async function stopAndUpload(recording: Audio.Recording) {
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  
  // Upload to Supabase Storage
  const file = await fetch(uri);
  const blob = await file.blob();
  
  const { data, error } = await supabase.storage
    .from('meeting-recordings')
    .upload(`${Date.now()}.m4a`, blob);
    
  return data.path;
}
```

---

## Environment Variables

```bash
# .env.local

# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx  # Server-side only

# Claude
ANTHROPIC_API_KEY=sk-ant-xxx

# AssemblyAI
ASSEMBLYAI_API_KEY=xxx

# Google
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Resend
RESEND_API_KEY=re_xxx

# App
EXPO_PUBLIC_APP_URL=https://thehive.app
```

---

## Build Commands

```bash
# Development
npx expo start  # Starts dev server, scan QR with Expo Go

# Web
npx expo start --web

# iOS Build (requires EAS)
eas build --platform ios

# Deploy web to Vercel
npx expo export --platform web
vercel deploy web-build
```

---

## Edge Functions: Authentication & Deployment

### Why We Handle JWT Verification Ourselves

Supabase Edge Functions traditionally relied on gateway-level JWT verification, but this approach has issues:
- Gateway caching can cause stale JWT verification
- Less control over error handling and specific error messages
- Auth logic hidden in infrastructure rather than owned in code

**Our approach**: We deploy all functions with `--no-verify-jwt` and handle JWT verification inside the function code using the `jose` library. This gives us full control and avoids gateway caching issues.

### Shared Auth Module

All authentication logic lives in `supabase/functions/_shared/auth.ts`:

```typescript
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';

// In your function:
const authHeader = req.headers.get('Authorization');
const auth = await verifySupabaseJwt(authHeader);

if (isAuthError(auth)) {
  return errorResponse(auth.error, auth.status);
}

const { userId, token } = auth;
// Now use userId and token for authenticated operations
```

### Function Types

We have two types of Edge Functions:

1. **User-authenticated functions** (`chat`, `invite`):
   - Require a valid user JWT
   - Use `verifySupabaseJwt()` from `_shared/auth.ts`
   - Create a Supabase client with the user's token for RLS

2. **Service functions** (`notify`, `transcribe`):
   - Use `SUPABASE_SERVICE_ROLE_KEY` for admin access
   - No user auth needed (internal/webhook endpoints)
   - Still deployed with `verify_jwt = false` for consistency

### Deployment

All functions are configured in `supabase/config.toml` with `verify_jwt = false`:

```bash
# Deploy all functions
supabase functions deploy

# Deploy a specific function
supabase functions deploy chat

# The config.toml handles --no-verify-jwt automatically
```

### Creating New Functions

When creating a new Edge Function that requires user authentication:

1. Create the function directory: `supabase/functions/my-function/index.ts`

2. Import and use the shared auth:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Verify JWT manually
  const authHeader = req.headers.get('Authorization');
  const auth = await verifySupabaseJwt(authHeader);

  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const { userId, token } = auth;

  // Create authenticated Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' } } }
  );

  // Your function logic here...

  return jsonResponse({ success: true });
});
```

3. Add to `supabase/config.toml`:
```toml
[functions.my-function]
verify_jwt = false
```

### Shared Modules

- `_shared/auth.ts` - JWT verification using jose library against Supabase JWKS endpoint
- `_shared/cors.ts` - CORS headers and response helpers (`handleCors`, `jsonResponse`, `errorResponse`)

---

## Testing Checklist

Before launch, verify:

- [ ] Google OAuth works on iOS and web
- [ ] Onboarding flow completes and creates profile
- [ ] Chat sends/receives messages correctly
- [ ] Agent tools store skills and wishes
- [ ] Wishes can be published/replaced
- [ ] Hive view loads all data correctly
- [ ] Queen Bee display works
- [ ] Audio recording works on iOS
- [ ] Audio uploads successfully
- [ ] Transcription returns correctly
- [ ] Meeting summaries generate
- [ ] Email notifications send
- [ ] Calendar events sync
- [ ] Admin can set Queen Bee
- [ ] Treasurer can update Honey Pot
- [ ] Push notifications work (iOS)

---

## Day-by-Day Build Plan

### Day 1: Foundation
- [ ] Create Expo project with TypeScript
- [ ] Set up NativeWind
- [ ] Create Supabase project
- [ ] Run schema migration
- [ ] Configure Google OAuth in Supabase
- [ ] Basic app shell with navigation

### Day 2: Auth + Onboarding
- [ ] Login screen with Google button
- [ ] Auth state management
- [ ] Onboarding screens (welcome, info, skills, wishes)
- [ ] Profile creation flow
- [ ] Basic chat UI for onboarding

### Day 3: Main Chat
- [ ] Chat interface component
- [ ] Supabase Edge Function for Claude
- [ ] Message persistence
- [ ] Basic agent with system prompt
- [ ] Tool definitions (no implementation yet)

### Day 4: Agent Tools
- [ ] Implement all tool handlers
- [ ] store_skill, store_wish working
- [ ] publish_wish working
- [ ] Query tools working
- [ ] Test full conversation flow

### Day 5: Hive View
- [ ] Queen Bee card component
- [ ] Wish board component
- [ ] Calendar integration setup
- [ ] Event list component
- [ ] Honey Pot display

### Day 6: Meetings + Admin
- [ ] Audio recorder component
- [ ] Upload to Supabase Storage
- [ ] AssemblyAI integration
- [ ] Summary generation
- [ ] Admin panel (Queen Bee, calendar, roles)
- [ ] Email notifications

### Day 7: Polish + Deploy
- [ ] Bug fixes from testing
- [ ] Mobile responsiveness
- [ ] Loading states
- [ ] Error handling
- [ ] Deploy web to Vercel
- [ ] Submit iOS build to EAS
- [ ] Seed 12 user accounts

---

## Future Enhancements (Post-MVP)

- Voice messages in chat
- Photo attachments for wishes
- Wish fulfillment celebrations
- Karma/contribution tracking (optional, could conflict with philosophy)
- Integration with payment systems
- Multiple Hive support
- Public Hive discovery
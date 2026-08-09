# HIVE — how this app works, and how to work on it

This file is loaded at the start of every session. It describes the app **as it
is today**, not as it was designed. Last rewritten **2026-08-05**.

If something here disagrees with the code, the code wins — and then fix this
file. The last version of this document was the day-one build plan, and it was
still telling sessions to build features that had been deliberately removed.

**Read the current state before you change anything.** The living record is in
Nat's brain folder, not in this repo:

- `~/Library/Mobile Documents/com~apple~CloudDocs/Documents/Hermes_Brain/Productization_of_Nats_Life/Current_Projects/HIVE/PROJECT.md`
- the newest file in that folder's `Receipts/` — start with the most recent
  `*_SESSION_HANDOFF.md`. It says what shipped, what is live, and what to do
  next.
- `AGENTS.md` in this repo, for the day-to-day working rules.

---

## What HIVE is

HIVE is a warm, small-community app that Nat and Lucas run. Members write down
what they are working on and what they need help with; other members help.

**There are several HIVEs, not one.** OG HIVE is the original (Las Vegas, keeps
the internal slug `default`). Tech HIVE and Production HIVE are separate
communities with their own members, meetings, boards and rhythm. More are
expected. **There is no member cap** — the old "12-person community" framing is
dead, and no code, copy or prompt should ever quote a member count.

Each HIVE is a row in `communities`. A person belongs to one or more through
`community_memberships`. Almost everyone belongs to exactly one.

### HIVE-Wide

**HIVE-Wide is the view above all the HIVEs** — a shared high street where you
can see what every HIVE is up to. Everybody lands there when they arrive; you
step down into your own HIVE when you want to.

Two things to hold onto:

1. **HIVE-Wide is a MODE, never a community id.** There is no row for it and
   there must not be — a pretend HIVE would have every query in the app asking
   a real database for an imaginary place. It lives in the auth context as
   `wholeHive` (see `lib/hooks/useAuth.ts`), and persists for the browser tab's
   lifetime via `lib/hiveSelection.ts`.
2. **It sits under "My HIVEs" alongside the real ones**, not in a section of its
   own. That was Nat's call and it removed a whole special case: one page list
   serves whichever place you are standing in, so a new feature gets added once
   instead of twice.

Every navigation destination declares what it does up there — see
`atWholeHive` in `lib/navigation.ts`:

| value | meaning | examples |
|---|---|---|
| `same` | means the same thing wherever you stand | App Feedback, Log out |
| `wide` | has a real all-HIVEs version, at `wideRoute` if it needs a different door | Home, Members |
| `hidden` | only means something inside one HIVE | Clive, Meetings, Honey Pot, Profile, Settings, Boards, Messages |
| `only` | lives at HIVE-Wide and nowhere else | The Buzz |

The name is **"HIVE-Wide"**, hyphenated, never "All HIVEs".

### The scope ladder

Anything shareable in HIVE sits on one of three rungs. The vocabulary lives in
`lib/hiveWide.ts` (`SCOPE_LADDER`) and the visual system in `lib/scopeLook.ts`.

| rung | key | who sees it |
|---|---|---|
| This HIVE only | `hive` | the people you joined with — where everything starts |
| HIVE-Wide | `all_hives` | everyone in every HIVE |
| Public | `public` | the newsletter and the-hive.app, where anyone can read it |

Two facts are kept apart on purpose: **whose it is** (a filled hexagon in that
HIVE's colour — `HiveMark`) and **how far it goes** (`WorldMark`, the Earth,
drawn in the near-black `#0B0B12` that no HIVE owns — the same colour the rail
and the HIVE-Wide header use). Something that stays home wears only its hexagon;
the world only appears once it has left.

**Public has a colour of its own**: solid teal `#0C7C7C` (`PUBLIC_MARK` in
`lib/scopeLook.ts`) behind the 📣, the same on cream and on the night sky. No
HIVE may be given that accent — it is reserved, exactly as the near-black is.
Public was the near-black filled in rather than outlined until 2026-08-06, on
the theory that the ladder would read as weight. It read as HIVE-Wide instead:
Nat, looking at an event card in OG HIVE, *"It looks like it is marked as
'public'… but 'public' is in black, and isn't black supposed to be more like
HIVE-Wide colors?"* Colour is what a person reads first, and filled-versus-
outlined in one colour is too fine to carry the difference between everyone in
the HIVEs and anybody on the internet.

A green was used for this until 2026-08-03 and is retired. `HIVE_WIDE_GREEN` is
still exported from `lib/scopeLook.ts` as deprecated; nothing new should use it.

Columns that carry this: `wishes.share_scope`, `board_categories.reach`,
`chat_rooms.reach`, `profiles.profile_scope`. Events say `members` and wishes
say `hive` for the same rung — `normaliseScope()` in `lib/scopeLook.ts` folds
them together. **Each HIVE also has a ceiling**, `communities.max_share_scope`
(migration 125): nothing in that HIVE may travel further than its ceiling
allows, whatever an individual member picks.

Anything unrecognised falls back to `hive`. The safe end of the ladder is always
the one that travels least.

---

## Clive

The in-app assistant is called **Clive**. He lives in the edge function
`hive-app/supabase/functions/chat/index.ts` — the system prompt is the
`SYSTEM_PROMPT` constant at the top of that file, and the ~23 tool definitions
start around line 398 in the same file. **That file is the only place Clive's
beliefs live.** Change it there.

What Clive currently knows and does:

- He is always speaking **inside exactly one HIVE** — the one in his context —
  and knows only that HIVE's people, wishes and history. He knows there are
  several HIVEs, and he is told never to quote a member count.
- He does not operate at HIVE-Wide. Asked about it, he explains what it is and
  points at it.
- He runs "high-definition wishing": helping someone turn a vague desire into a
  specific, actionable, bounded one. He always reflects a wish back and gets an
  explicit yes before saving it.
- He can act, not just chat: save and publish wishes, post to boards and reply
  in threads on the member's behalf (everything posts under **their** name),
  read meeting summaries, search action items and board posts, and update
  profile fields.
- Wider changes to shared state go through a **two-step safety flow**:
  `propose_app_actions` first, then `apply_pending_actions` only after the
  member's next message clearly approves it. Never both in one response.
- He can see boards, visible wishes, skills, events, meetings and the Honey Pot.
  He **cannot** see DMs, group DMs or private rooms, and is told to say so.
- Models: `claude-haiku-4-5` for ordinary chat, `claude-sonnet-5` for wish
  refinement and app stewardship (`selectChatModel`). Sonnet 5 thinks by
  default, so the deep path gets a much larger `max_tokens` — a small cap would
  be eaten by reasoning and truncate the reply.

**Queen Bee is retired.** The idea — one member a month getting the community's
focus — is gone. Clive's prompt has an explicit instruction saying so, and
telling him what replaced it: every member's HD wish is live at once, the
monthly check-in gathers what everyone is working on, and HIVE Help is the
shared act of kindness each month.

> **A retired feature that is still a callable tool is not retired.** On
> 2026-08-04 someone had to surgically remove `get_current_queen_bee`,
> `add_queen_bee_update` and the `queen_bee_preference` write from the live
> assistant, because he was still perfectly able to use them. Do not
> reintroduce them. Do not add a tool for anything the product no longer does.

### Queen Bee leftovers — cleaned up 2026-08-09

The app-layer surface is gone: `lib/claude.ts`, `app/onboarding/*`, the admin
"Set Queen Bee" modal, and `components/hive/QueenBeeCard.tsx` were already
deleted by earlier sessions (this list had gone stale — none of them were
still in the tree when checked). `lib/newsletterHeaders.ts`'s banner-matching
bug was already fixed too. What was still real and got removed this session:
`types/index.ts`'s `QueenBee`/`QueenBeeStatus`/`QueenBeePreference`/
`QueenBeeUpdate` types and the `queen_bee`/`queen_bee_update` union members;
and — the one that mattered — **Clive's context builder
(`supabase/functions/chat/context/index.ts`) was still live-querying
`queen_bees` for the current month and would have injected a "Current Queen
Bee" section into his prompt if any row ever matched it.** Dormant (no
current-month row existed), but a real gap in "Queen Bee is retired," not
cosmetic. Removed the query, its types in `context/types.ts`, the token
budget entry, a stale line in the board-activity summarizer prompt, the
`notify` function's `queen_bee_update` message type, and a title-generator
example. `types/index.ts` also lost `MonthlyHighlight` (zero importers,
discovered while tracing `queen_bee_id`'s only other reference).

**Left alone, on purpose:** the `queen_bees` / `queen_bee_updates` database
tables (4 rows, all historical, none current) — dropping live tables is a
bigger decision than deleting app code, NAT'S CALL. Also left alone:
`apply-meeting-notes/index.ts`'s defensive `delete summaryBase.queen_bee_highlights`
(harmless, still protects old stored summaries).

**New finding, not yet acted on:** `supabase/functions/chat/context/summarizers.ts`
and its `summarizeBoardActivity` function have zero callers anywhere in the
function's own import graph — the deploy bundler doesn't even upload the
file. Possibly a second orphaned module; wants its own look before deleting
(check whether `CommunityContextSummaryType`'s `'board_activity'` value and
the cached-summary expiry logic still mean anything without it).

Five hooks were also fully orphaned and deleted the same session (zero real
importers, all superseded by `use*Query.ts` equivalents):
`lib/hooks/useChat.ts`, `useHiveOnlyScreen.ts`, `useRoomMessages.ts`,
`useTypingIndicators.ts`, `useUser.ts`. `lib/google-calendar.ts` (unused,
zero importers) was deleted too.

---

## Tech stack

- **Expo (React Native) + TypeScript** — one codebase for iOS and web. Web is
  where nearly everybody actually uses it.
- **Expo Router** — file-based routing, `hive-app/app/`.
- **NativeWind** (Tailwind syntax) plus a lot of inline styles.
- **Supabase** — auth, Postgres with row-level security, storage, realtime, edge
  functions (Deno).
- **TanStack Query** for server state (`lib/queryClient.ts`, `lib/hooks/use*Query.ts`).
- **Claude API** for Clive and for meeting/newsletter generation, called only
  from edge functions.
- **AssemblyAI** for meeting transcription with speaker labels.
- **Google Calendar / Meet** for scheduling meetings.
- **Resend** for email.
- **Hosting**: Vercel for web (`app.the-hive.app`), Expo EAS for iOS builds.

Why these, still true: one codebase reaches the App Store and the browser;
Supabase puts auth, database, storage and realtime behind one client with
row-level security doing the privacy work; NativeWind means one styling
vocabulary on both platforms.

---

## Where things live

```
the-HIVE/
├── CLAUDE.md          ← this file
├── AGENTS.md          ← day-to-day working rules
├── site/              ← the PUBLIC site (the-hive.app), separate Vercel project
└── hive-app/          ← the members' app (app.the-hive.app) — run commands here
    ├── app/
    │   ├── (auth)/          login, OAuth callback
    │   ├── (app)/           the signed-in app (see below)
    │   ├── join.tsx         invite acceptance
    │   └── _layout.tsx      root layout — this is where `wholeHive` lives
    ├── components/
    │   ├── ui/              shared building blocks — look here FIRST
    │   ├── board/ chat/ hive/ meetings/ messaging/ navigation/
    │   ├── profile/ skills/ surveys/ events/ admin/
    ├── lib/                 one concern per file, heavily commented
    │   └── hooks/
    ├── types/index.ts       TypeScript types mirroring the database
    └── supabase/
        ├── migrations/      147 files, numbered 001–146
        └── functions/       22 edge functions
```

### The screens

Everything under `app/(app)/`. The ones in the side rail, in rail order, come
from `NAV_DESTINATIONS` in `lib/navigation.ts`:

| route | what it is |
|---|---|
| `/hive` | Home for the HIVE you are in (`hive.tsx`) |
| `/hive-wide` | Home when you are standing above the HIVEs |
| `/` | Clive |
| `/members` | member directory and member cards |
| `/board` | boards, threads, replies |
| `/hive-wide-boards` | the same screen, asked `reach="all_hives"` |
| `/messages` | rooms, DMs, group DMs |
| `/meetings` | meetings, recordings, summaries |
| `/honey-pot` | the shared pot of money (per-HIVE, off by default) |
| `/buzz` | The Buzz — every newsletter you may read. HIVE-Wide only |
| `/profile` | your own profile |
| `/settings` | notifications, email preferences, who can see you, your name in a HIVE |
| `/app-feedback` | tell the people who build the app something |
| `/admin` | running a HIVE. Tabbed per HIVE |

Reached from inside other screens rather than the rail: `arrival-board.tsx`,
`meeting-helper.tsx`, `monthly-tuneup.tsx`, `newsletter.tsx`.

**Adding a destination**: add it to `NAV_DESTINATIONS`, pick a standard emoji,
done. It appears in the rail in that order and nowhere else needs editing. Nav
icons are plain emoji on purpose — the hand-drawn HIVE icon family was retired
from navigation so that adding a feature never means commissioning a drawing.

---

## The data model, in summary

There are **147 migration files** in `hive-app/supabase/migrations/`, numbered
001–146 (two files share `103_`). Migrations 143–146 were applied and verified
against production on 2026-08-04. **Do not treat any single migration as the
current state** — later ones silently override earlier ones. To know what is
true, query the live database.

Migration filenames from 100 onward read as sentences and are a genuinely useful
history: `124_share_scope`, `128_owner_is_not_admin`,
`135_hive_wide_foundations`, `142_the_boards_come_home`,
`146_the_attachments_get_a_lock`.

The authoritative shape of every table, with comments explaining why each column
exists and which migration added it, is **`hive-app/types/index.ts`**. Read that
rather than reconstructing DDL. The main groups:

- **People and places** — `profiles`, `communities`, `community_memberships`,
  `community_invites`. `communities` carries `accent_color`,
  `max_share_scope`, `honey_pot_enabled`, `meeting_cadence`, `slide_deck_url`,
  `meeting_helper_notes`.
- **Roles** — `UserRole` is `member | treasurer | admin`, held **per HIVE** on
  the membership row. Separately, `profiles.is_owner` is the god level (Nat and
  Lucas): anything that speaks for a HIVE to the outside world, or reads across
  HIVEs, asks `is_owner`, not `admin` (migration 128).
- **Wishes and skills** — `wishes` (with `share_scope`, `is_spotlight`,
  optional link to a board), `wish_comments`, `wish_comment_reactions`,
  `wish_granters`, `skills`.
- **Boards** — `board_categories` (with `reach`, `topic_kind`, owner, status),
  `board_posts` (with `visibility`, pinning, anchoring, completion,
  attachments), `board_replies`, `board_reactions`, member tags.
- **Messaging** — `chat_rooms` (`community | dm | group_dm`, with `reach`),
  `chat_room_members`, `room_messages`, `message_reactions`, typing indicators.
- **Clive** — `conversations`, `conversation_projects`, `chat_messages`,
  `context_summaries`, `user_insights`, `agent_action_requests` (the propose /
  apply flow).
- **Meetings** — `meetings`, `action_items`, `events`, transcription jobs,
  monthly highlights.
- **Rhythm** — `surveys` and `survey_responses` (the monthly check-in),
  `daily_question_answers`, `monthly_focus` (the HIVE Focus — one row with no
  `community_id` is the shared one; a row naming a HIVE replaces it for them).
- **Money** — `honey_pot`, `honey_pot_transactions`, dues.
- **The outside world** — `newsletter_subscribers`, `waitlist`,
  `public_newsletters`, public events view.
- **App feedback** — `app_feedback`, deliberately not attached to a HIVE, with
  owner replies (migration 143).

Storage buckets: `avatars`, `meeting-recordings` (private, folder per
community), and **`attachments` (private since migration 146)**.

---

## Shared building blocks — use these, do not re-invent them

Look in `components/ui/` and `lib/` before writing anything. Most of these exist
because the same thing was hand-written three or four times and drifted.

| use | for |
|---|---|
| `lib/showAlert.ts` → `showAlert()` | telling somebody something. **Never `Alert.alert`** |
| `lib/showAlert.ts` → `confirmAction()` | a yes/no where restructuring state is not worth it |
| `components/ui/ConfirmDialog.tsx` | the nicer yes/no — a real view, wears the page's colours |
| `components/ui/SignedImage.tsx` | **any member upload.** A component, not a hook, because attachments render inside `.map()` |
| `lib/signedAttachment.ts` | signing a stored attachment URL by hand |
| `components/ui/DictationRow.tsx` | adding a mic to a prose text box |
| `lib/hooks/useDictation.ts` | the append logic behind it — do not re-write it, it has been wrong twice |
| `components/ui/ThinkingBee.tsx` | a loading state. Spinners stay only inside buttons |
| `components/ui/HiveReactions.tsx` | emoji reactions, boards and messages alike |
| `lib/pageSkin.ts` → `usePageSkin()` | page, card, border and ink colours. Never hard-code cream and charcoal |
| `lib/scopeLook.ts` | scope colours, chip sizes, and what a screen reader hears |
| `lib/hiveBrand.ts` | a HIVE's display name and accent colour, and lifting that accent so it reads on dark |
| `lib/navigation.ts` | every destination in the app, once |
| `lib/appNews.ts` | "what's new" — read by Home's strip, the newsletter draft and the meeting deck |
| `lib/hiveWide.ts` | what HIVE-Wide is, said once, for three surfaces |
| `lib/maintenance.ts` | the door. `HIVE_CLOSED = true` shuts the app to everyone but the keepers |

The mic rule, from the 2026-08-04 sweep of 100 text inputs:

| kind of field | gets |
|---|---|
| prose (multiline: replies, posts, wishes, bios, notes) | clip **and** mic |
| short words (titles, skills, fun facts, search) | mic only |
| structured (time, money, email, phone, URL, emoji, month) | neither |

---

## Edge functions: authentication and deployment

### Why we verify JWTs ourselves

Supabase's gateway-level JWT verification caches, hides the auth logic in
infrastructure, and gives poor error messages. **Every function is deployed with
`verify_jwt = false`** and verifies the token in its own code using `jose`.

### The shared auth module

All of it lives in `supabase/functions/_shared/auth.ts`:

```typescript
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';

const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
const { userId, token } = auth;
```

### Two kinds of function

1. **User-authenticated** (`chat`, `invite`, `app-feedback`, the `notify-*`
   family, meeting create/update/delete, …) — require a valid user JWT via
   `verifySupabaseJwt()`, then build a Supabase client with the **user's** token
   so row-level security still applies.
2. **Service functions** (`notify`, `transcribe`, `meeting-reminder`,
   `check-in-reminder`, `seal-meeting`) — use `SUPABASE_SERVICE_ROLE_KEY` for
   admin access, called server-to-server or by cron.

> A service-role function that never reads the Authorization header is a hole,
> not a design. `notify-dm` and `notify-board-reply` were exactly that until
> 2026-08-04: anyone could forge a notification and a push from any member.
> If a function runs as service role, it must still prove who is calling it.
> `transcribe` and `meeting-reminder` are still unauthenticated webhooks — known
> and open.

### Creating a new function

1. `supabase/functions/my-function/index.ts`
2. Handle CORS with `handleCors` from `_shared/cors.ts`, verify the JWT as
   above, and return with `jsonResponse` / `errorResponse`.
3. Add to `supabase/config.toml`:

```toml
[functions.my-function]
verify_jwt = false
```

Shared modules: `_shared/auth.ts` (JWT verification against Supabase's JWKS),
`_shared/cors.ts` (headers and response helpers), `_shared/streaming.ts` (SSE,
used by `chat`).

### Deploying

```bash
supabase functions deploy               # all
supabase functions deploy chat          # one
```

---

## Environment and secrets

The app reads only two variables at build time — `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (`lib/supabase.ts`), plus
`EXPO_PUBLIC_BUILD_ID`, which Vercel fills with the commit SHA and which
`/version.json` reports. Everything secret lives in Supabase edge-function
secrets: `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `RESEND_API_KEY`,
`FROM_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`HIVE_GOOGLE_REFRESH_TOKEN`, `INVITE_URL_BASE`, `EXPO_PUBLIC_APP_URL`,
`SUPABASE_SERVICE_ROLE_KEY`.

**The service-role key in `hive-app/.env` is dead.** Get a live one from the
Supabase management API — `GET /v1/projects/<ref>/api-keys?reveal=true`, using
the token in the macOS keychain under `Supabase CLI`. A stale key returns a 403
reading *"Failed to base64url decode the signature"*, which looks like a policy
problem and is not.

Database pushes need the real database password in `SUPABASE_DB_PASSWORD`. Never
ask Nat to paste a secret into chat.

---

## Running, building, deploying

Run everything from `hive-app/`.

```bash
npm run typecheck          # tsc --noEmit
npm run doctor             # expo-doctor
npm run release:check      # both of the above
npx expo start             # dev server
npx expo start --web       # web
npm run export:ios         # export the iOS bundle
eas build --platform ios   # iOS build via EAS
```

- **The members' app deploys itself.** Pushing to `main` triggers Vercel to
  build the `the-hive` project → `app.the-hive.app`. Confirm what is actually
  live by fetching `/version.json` and comparing the commit, not by looking for
  a green tick.
- **The public site does not.** `site/` is a separate Vercel project
  (`hive-public`) that is **not** git-linked. It ships only by CLI:
  `cd site && npx vercel --prod --token "$(security find-generic-password -s 'Vercel CI' -w)"`.
- Code changes need a deployed bundle and a hard refresh. In-app pull-to-refresh
  only refreshes data.

---

## Gotchas — each of these has cost a real session

- **`Alert.alert` does nothing on web.** react-native-web's implementation is,
  in full, `class Alert { static alert() {} }`. Not degraded — nothing. Almost
  everybody uses HIVE in a browser, so every `Alert.alert` is a message nobody
  receives, and it is why "the button does nothing" keeps happening: the write
  fails, the code politely explains why, and the explanation is thrown away.
  Use `lib/showAlert.ts` for a statement and `ConfirmDialog` for a question.
  (`board.tsx` still calls raw `Alert.alert` in 23 of its 26 error paths.)

- **The `attachments` bucket is private.** It was created public, and a public
  bucket opens the **listing**, not just the files — an audit with no
  credentials walked the folders (they are member ids) and downloaded a private
  DM image. Anything that renders a member's upload must go through
  `components/ui/SignedImage.tsx`, which resolves the stored URL to a
  short-lived signed one via `lib/signedAttachment.ts`. "Nobody knows the
  address" is not a control.

- **The service-role key in `.env` is dead.** See above.

- **`drop function if exists` with the wrong argument types is a silent no-op.**
  It reports success and changes nothing. Verify with
  `select oid::regprocedure from pg_proc where proname = '…'`.

- **`git checkout -- <file>` reverts everything uncommitted in that file**,
  including work from earlier in the same session. It cost a whole admin-panel
  feature once. Also: `git add -A` sweeps in files from work you have not
  described yet.

- **A component that reads context itself will disagree with a screen that does
  not.** `AppHeader`, `HeaderTabs` and `pageSkin` all read `wholeHive`
  themselves, by design. `hive.tsx` referenced it nowhere — so a new account got
  a black HIVE-Wide header over a cream HIVE page with invisible tabs. Both
  halves were doing as told; nobody was refereeing.
  **`hive.tsx` reads `wholeHive` itself now** (`:694`, and the redirect at
  `:714`), which is what actually fixes it.
  > A previous version of this file said "`lib/hooks/useHiveOnlyScreen.ts` is
  > the referee now." That hook was imported by nothing — checked 2026-08-06,
  > written for this bug, never wired into a single screen — so for a while
  > the file said fixed while the fix sat on a shelf. **Deleted 2026-08-09**
  > rather than left as a citation nobody could act on. The lesson generalises:
  > when a comment names a file as "the fix," check that the file is actually
  > imported before trusting the comment.

- **Never build the web bundle in CI from pulled environment variables.**
  Supabase keys are marked sensitive, so `vercel env pull` returns them empty,
  the build bakes in blank values, and every page 500s. Let Vercel build.

- **Query the live data before writing a trigger or constraint.** A board-reach
  trigger that looked obviously correct would have emptied the public newsletter
  archive, because six live newsletters are `visibility = 'public'` posts on a
  board whose `reach` is `hive` — on purpose.

- **Migrations lie about the current state.** Later ones silently override
  earlier ones. Work from live `pg_policies`, not from reading migration files
  in order.

- **Gating a feature on "is this person in more than one HIVE?" hides it from
  nearly every member.** Most people are in exactly one.

- **`putImageData` is banned in `SpaceGlobe`.** It writes raw device pixels
  while everything around it respects the retina transform.

- **Never name a form honeypot field `company`.** Chrome autofills it, so real
  people trip their own bot trap and the form dies silently.

---

## House style

- **Plain English, always.** No unexplained developer jargon anywhere, chat
  included. Explain a term in ordinary words first.
- **Say what a thing IS.** Never "it isn't X, it's Y" — write the Y and stop.
  This is Nat's own brand rule and it applies to code comments too.
- **Brand**: "H.I.V.E." for the formal name, "HIVE" in product copy. Never
  "the Hive", "hive", or a mixed-case variant.
- **"HIVE-Wide"**, never "All HIVEs".
- **Comments explain why, not what.** The files in `lib/` are the model: they
  record the decision, who made it, when, and what it replaced. That is why a
  session six weeks later does not undo it by accident.
- **Prefer shared components.** If you improve an interaction on one screen,
  check whether it belongs in `components/ui/` instead of being duplicated.
- **Ship the thing rather than describing it.** Nat's words: *"why are you just
  telling me about these things and not fixing them?"*
- **When she asks what something does, check whether it does it.** "Does it show
  the turnaround?" is a bug report.
- Leave the campsite better than you found it. Do not leave untracked files or
  uncommitted changes without deciding what they are.

---

## Things this file cannot tell you

Deliberately left out because they change too fast, or could not be verified
from the repo:

- **What is live right now.** Fetch `app.the-hive.app/version.json`.
- **How many HIVEs and members exist.** Three HIVEs are named throughout the
  code and receipts (OG, Tech, Production); the database was not queried to
  write this. Never quote a member count anywhere in the product.
- **What to do next.** That is the newest `*_SESSION_HANDOFF.md` receipt in the
  brain folder, always.

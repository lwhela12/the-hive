# HIVE App Agent Notes

## Project

HIVE is an Expo / React Native app for a small community network. The current product direction is a warm community app with:

- member directory and member profiles
- boards / threads / replies
- wishes and wish-granting flows
- messages / rooms / reactions
- Daily Swarm prompts and member overlap
- Hummdinger/community rhythm rather than a single old "Queen Bee only" center

Treat consistency across screens as important. If an interaction pattern is improved in one major surface, check whether the same pattern should be shared elsewhere instead of duplicating one-off UI.

## Repo layout

- App code lives in `hive-app/`.
- Expo Router screens live in `hive-app/app/`.
- Shared UI components live in `hive-app/components/ui/`.
- Board components live in `hive-app/components/board/`.
- Messaging components live in `hive-app/components/messaging/`.
- Supabase migrations and functions live in `hive-app/supabase/`.

## Standard commands

Run commands from `hive-app/` unless noted otherwise.

```bash
npm run typecheck
npm run lint:page-headers
npm run doctor
npm run export:ios
```

Useful status commands from repo root:

```bash
git status --short --branch --untracked-files=all
git diff --stat
git diff --check
```

## How to work — the rules that got learned the hard way

Moved here from the Trello card at Nat's ask (2026-08-19): checklists are for
tasks that still need doing; how-to-work lives with the repo.

- **THE RULE, from Nat 2026-08-19:** "I'm making the same decision, and instead
  of you applying that to the whole site, I'm going around and finding every
  iteration where it's broken, and then I'm the one debugging it. I should be
  able to find a problem one time, and then you go fix every instance of it."
- So when she settles a rule, SWEEP for it. Grep every screen for the old
  shape, list them, fix them all in one pass, and say which files you touched.
  Never ship one instance and wait to be told about the next.
- Same for copy. A word she corrects once is wrong everywhere it appears —
  search the whole app for it, not just the screen she screenshotted.
- Show her the running app early. Agents read code and cannot see the screen;
  half of any day's real findings only exist in a browser.
- Outside-in proof: check a claim from the running app (the email, the button,
  the tile), never from the code.
- No member email without Nat seeing the rendered preview and saying go.
- Preserve live data; archive, never delete.

## Development rules

- Keep the repo clean. Do not leave untracked files or uncommitted changes without deciding whether to commit, remove, or intentionally ignore them.
- Do not commit `.env`, credentials, tokens, local build artifacts, or generated caches.
- Prefer shared components for repeated interaction patterns.
- **Page headers are WHERE + WHAT only.** `AppHeader` says where the member is
  (HIVE-Wide / OG HIVE / Tech HIVE / Production HIVE) and what page this is
  (Members / Boards / Clive / etc.), then stops. Never add explanatory copy
  beneath a top-level page title or restore an `AppHeader` subtitle prop. Keep
  useful guidance beside the control or content it explains — cards, tabs,
  forms, empty states, and wizard steps still get the words they need. Every
  top-level page uses `AppHeader`; do not hand-roll a second masthead.
- Before changing deployed/live behavior, inspect existing data flow and similar working code.
- For HIVE web/mobile testing, remember that in-app refresh updates app data; code changes require a deployed bundle / browser hard refresh / app reload.

## Reaction UI convention

The shared HIVE reaction system lives at:

- `hive-app/components/ui/HiveReactions.tsx`

Messages and boards should use this shared system so emoji options, picker behavior, display pills, and custom emoji support stay consistent across the app.

## Supabase / deployment notes

- Supabase database pushes require the actual database password via `SUPABASE_DB_PASSWORD`; do not ask the user to paste secrets into chat.
- Edge Functions live in `hive-app/supabase/functions/` and should be deployed through the Supabase CLI when credentials are available.
- EAS/TestFlight work requires Expo/EAS auth and Apple pipeline access.

## Cleanup mindset

Leave the campsite better than you found it:

- if something is loose, tighten it
- if something is broken, fix it
- if something is sloppy, clean it up
- if you do not know what a file/change is, inspect it and decide where it belongs

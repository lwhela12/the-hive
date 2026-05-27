# HIVE TestFlight Readiness Checklist

Last local readiness pass: 2026-05-27

## Current verdict

HIVE is close to a TestFlight candidate, but not fully TestFlight-ready until an authenticated EAS iOS store build succeeds and the Supabase production backend is migrated/deployed.

## Local checks that passed

Run from `hive-app/`:

```bash
npm run release:check
npm run export:ios
```

Verified locally:

- TypeScript compile: passed (`tsc --noEmit`)
- Expo Doctor: passed (18/18 checks)
- iOS JS export/bundle: passed (`expo export --platform ios`)
- Basic EAS config exists (`eas.json` has `testflight` and `production` profiles)
- App config has iOS bundle id `com.lucaswhelan.thehive`

## Changes made during readiness pass

- Added release scripts to `package.json`:
  - `typecheck`
  - `doctor`
  - `export:ios`
  - `release:check`
- Added `.expo-export/` to `.gitignore`
- Updated the `ws` transitive dependency in `package-lock.json` via `npm audit fix --omit=dev`, reducing npm audit findings from 21 moderate to 20 moderate.
- Hardened mention notification Supabase Edge Functions so they verify the caller's JWT and reject forged sender/community/target payloads:
  - `supabase/functions/notify-board-mention/index.ts`
  - `supabase/functions/notify-wish-mention/index.ts`
  - `supabase/functions/notify-chat-mention/index.ts`

## Remaining blockers before actual TestFlight build

### 1. EAS auth/build not verified

This machine is not logged in to EAS:

```bash
npx eas-cli whoami
# Not logged in
```

Before June 1, Lucas/Nat should run:

```bash
cd /Users/thenateffect/the-HIVE/hive-app
npx eas-cli login
npx eas-cli whoami
npx eas-cli build --profile testflight --platform ios
```

If npm cache permissions break `npx`, use a temporary cache:

```bash
npm_config_cache=/tmp/hive-npm-cache npx eas-cli login
npm_config_cache=/tmp/hive-npm-cache npx eas-cli whoami
npm_config_cache=/tmp/hive-npm-cache npx eas-cli build --profile testflight --platform ios
```

The root cause observed locally: part of `~/.npm/_cacache` is owned by `root`, which can block npx installs.

### 2. Supabase backend rollout

Before distributing TestFlight:

```bash
supabase db push
supabase functions deploy notify-board-mention --no-verify-jwt
supabase functions deploy notify-wish-mention --no-verify-jwt
supabase functions deploy notify-chat-mention --no-verify-jwt
supabase functions deploy chat --no-verify-jwt
```

Also confirm production secrets are present for functions that need them:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `RESEND_API_KEY`
- Google calendar/client secrets if meeting scheduling is enabled

### 3. npm audit has remaining moderate advisories

Current audit state after the safe fix:

- 20 moderate vulnerabilities remain.
- Most require a breaking Expo SDK 56 upgrade, so do not force-upgrade right before TestFlight unless Lucas/Nat intentionally choose to do an SDK migration.
- `react-native-markdown-display` depends on vulnerable `markdown-it` with no available npm audit fix.

Recommendation: track these as release debt, not as a June 1 TestFlight blocker unless you expose untrusted markdown/CSS input broadly.

## Device smoke test script for TestFlight

On a real iPhone, test these before inviting the wider HIVE group:

1. Install TestFlight build.
2. Fresh login works without confusing redirects.
3. App resumes without requiring manual refresh.
4. Push notification permission prompt appears at the right time.
5. Push token saves to the profile.
6. Board post creation works.
7. Board reply works.
8. `@name` mention from a board post creates notification + push.
9. `@hive`/broadcast mention behavior works if enabled by migration 095.
10. Wish comment / wish mention works.
11. Community chat message works.
12. Chat `@name` mention works.
13. DM notification works.
14. Activity feed opens the right board/wish/chat target.
15. Profile edit saves.
16. Profile photo upload works.
17. Attachment upload works on board/chat.
18. Meeting recording permission works.
19. Meeting scheduling/import/transcription path works if included in the build.
20. Sign out and sign back in works.

## App Store / TestFlight metadata to prepare

- App Store Connect app exists for bundle id: `com.lucaswhelan.thehive`
- TestFlight compliance/encryption answer matches `ITSAppUsesNonExemptEncryption = false`
- Privacy labels cover:
  - account/contact info
  - user-generated content
  - photos/camera uploads
  - microphone/audio recordings
  - push notifications
  - analytics if any are added later
- Review notes explain:
  - HIVE is invite/community based
  - microphone is for meeting recording
  - camera/photo library are for profile photos and attachments
  - background audio mode is for meeting recording if the app truly needs it
- iPhone screenshots ready
- iPad screenshots/testing ready, or disable tablet support before public App Store release

## Commands for the June 1 handoff

```bash
cd /Users/thenateffect/the-HIVE/hive-app

git status --short --branch
npm install
npm run release:check
npm run export:ios
npm audit --omit=dev --audit-level=moderate
npm_config_cache=/tmp/hive-npm-cache npx eas-cli whoami
npm_config_cache=/tmp/hive-npm-cache npx eas-cli build --profile testflight --platform ios
```

If the build succeeds, upload/distribute through EAS/TestFlight and run the device smoke test above before inviting the full group.

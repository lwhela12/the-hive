# HIVE code + product readiness review

Date: 2026-05-27
Reviewer: Hermes
Scope: local codebase review only. No commits, no Supabase deployment, no EAS/TestFlight build.

## Bottom line

HIVE is a strong TestFlight candidate from a product direction standpoint. The app has a coherent and differentiated loop: Clive helps members articulate wishes and skills; wishes become board threads; members respond through boards/messages/mentions; meetings and action items convert real-world community energy back into the app.

But the codebase is not yet in a clean release-candidate state because the current working tree is large and uncommitted, backend deployment is not verified, Supabase Edge Functions are outside the current TypeScript quality gate, and no real-device TestFlight smoke test has been run.

Recommendation: do not treat this as “public App Store ready” yet. Treat it as “close to TestFlight once Lucas does the EAS build, Supabase is deployed, and the smoke test passes.”

## Verification run locally

Passed:

- `npm run release:check`
  - `tsc --noEmit`: passed
  - `expo-doctor`: passed, 18/18 checks
- `npm run export:ios`: passed
- `git diff --check`: passed

Not clean / not verified:

- `npm audit --omit=dev --audit-level=moderate`: fails with 20 moderate advisories
- EAS/TestFlight build: not verified here
- Supabase migrations/functions: not deployed or runtime-verified here
- Supabase function TypeScript/Deno checks: not verified here because `deno` is not installed
- Real-device smoke test: not performed

## Current git state

Tracked diff:

- 26 tracked files changed
- 1,487 insertions
- 244 deletions

Untracked release-relevant files:

- `TESTFLIGHT_READINESS.md`
- `HIVE_CODE_PRODUCT_REVIEW.md`
- `lib/hooks/usePersistentTextDraft.ts`
- `lib/hooks/useWebAttachmentDropZone.ts`
- `lib/memberAliases.ts`
- `supabase/migrations/094_notification_activity_metadata.sql`
- `supabase/migrations/095_board_broadcast_mention_notifications.sql`

Important: these untracked files must be committed or intentionally discarded before Lucas builds. TypeScript can pass locally because these files exist on this machine, but another build checkout will not have them unless committed.

## Product feature checklist inferred from recent app updates

### Found and source-verified

1. TestFlight readiness scripts/docs
   - Evidence: `package.json`, `TESTFLIGHT_READINESS.md`, `.gitignore`
   - Status: local checks pass; EAS build still external

2. Mention notification security hardening
   - Evidence: `supabase/functions/notify-board-mention/index.ts`, `notify-wish-mention`, `notify-chat-mention`
   - Status: source verified; needs deploy/runtime smoke test

3. Notification metadata for activity deep links
   - Evidence: migration 094, `types/index.ts`, `lib/hooks/useActivityFeed.ts`
   - Status: implemented locally; migration must be applied

4. Broadcast/whole-HIVE mentions
   - Evidence: `lib/mentions.ts`, `MentionSuggestions.tsx`, migration 095
   - Status: implemented for board posts/replies via migration; push behavior needs smoke test

5. Activity feed expansion
   - Evidence: `lib/hooks/useActivityFeed.ts`, `app/(app)/hive.tsx`
   - Includes board replies, personal mentions, static app updates, board/wish/chat routing

6. Board deep links and navigation persistence
   - Evidence: `app/(app)/board.tsx`, `lib/navigationState.ts`, recent commits
   - Status: source verified; runtime navigation smoke test needed

7. Member alias/nickname matching
   - Evidence: `lib/memberAliases.ts`, board/member search, chat function
   - Status: source verified; hard-coded alias list will need maintenance

8. Clive search and community-safe context improvements
   - Evidence: `supabase/functions/chat/index.ts`, migration 093 in repo history
   - Status: source verified; function redeploy needed

9. Daily answers in member profiles
   - Evidence: `app/(app)/members.tsx`
   - Status: source verified; confirm this is intended privacy-wise

10. Persistent drafts
   - Evidence: `lib/draftStore.ts`, `usePersistentTextDraft.ts`, chat/board/profile/meetings files
   - Status: source verified; test sign-out/user-switch leakage

11. Web drag/drop attachments and short video support
   - Evidence: `useWebAttachmentDropZone.ts`, chat/board composers, recent commits
   - Status: source verified; browser/native smoke test needed

12. Skills Garden polish
   - Evidence: `components/profile/SkillBubbleGarden.tsx`, recent commits
   - Status: source verified; visual/device testing needed

13. Meeting import/apply workflow
   - Evidence: `app/(app)/meetings.tsx`, meeting summary components/functions
   - Status: strong product pattern; runtime test needed

14. Profile/survey persistence and reopening
   - Evidence: `app/(app)/profile.tsx`
   - Status: source verified; smoke test needed

15. Account switch / invite / onboarding hardening
   - Evidence: recent commits and navigation/onboarding files
   - Status: source verified; auth runtime test needed

## Clean-code risks before TestFlight

### P0: Commit or branch the release candidate

The biggest cleanliness issue is not TypeScript; it is reproducibility. The app has many local changes and several untracked files. Before Lucas builds, create a clean release branch or commit so the TestFlight artifact maps to a real git state.

### P0: Deploy/verify Supabase before inviting testers

The client now expects notification metadata and new mention behavior. If migrations/functions are not deployed, the app may pass local build checks while deep links/notifications fail in real use.

### P0: Real-device smoke test is mandatory

The most important flows for adoption are runtime-only:

- fresh login
- app resume without manual refresh
- push notification prompt and token save
- board post/reply
- `@name` mention
- `@hive` mention
- wish comment/mention
- community chat + DM
- Activity item opens the right target
- profile edit/photo upload
- attachment upload
- meeting notes/recording flow if included
- sign out/sign back in

### P1: Add a Supabase function quality gate

`npm run typecheck` does not check `supabase/functions`. Add Deno checking before release, e.g. once Deno is available:

- `deno check supabase/functions/chat/index.ts`
- `deno check supabase/functions/notify-board-mention/index.ts`
- `deno check supabase/functions/notify-wish-mention/index.ts`
- `deno check supabase/functions/notify-chat-mention/index.ts`

### P1: Add lint/tests later, but do not block the immediate TestFlight solely on this

Current gates are typecheck, Expo Doctor, and export. That is acceptable for a limited TestFlight, but not enough for long-term cleanliness.

### P1: Track npm audit debt

Remaining advisories are moderate. Most force a breaking Expo SDK upgrade; one comes through `react-native-markdown-display` / `markdown-it` with no fix. Do not force-upgrade Expo right before TestFlight unless Lucas intentionally wants an SDK migration.

## Product/engagement assessment

### What is strongest

1. Clive/HD-wishing is the core differentiated idea.
   - It gives the app usefulness even when the community feed is quiet.

2. Wish -> board -> help -> granted is the strongest engagement loop.
   - This should become the main product loop.

3. Home is becoming the right hub.
   - Activity, to-dos, upcoming events, wishes, dues/Honey Pot, and member updates create reasons to return.

4. Meetings can convert offline HIVE energy into app action.
   - The import/apply-notes pattern is strong because it keeps AI-generated changes reviewable.

5. Skills Garden is emotionally resonant.
   - It fits the HIVE metaphor and can become matching infrastructure.

### What may hurt success if not simplified

1. Too much surface area for a small community.
   - Home, Clive, Members, Boards, Messages, Meetings, Profile, Honey Pot, Admin is a lot.

2. Home needs a clearer “what needs me today?” stack.
   - Small-community engagement depends on clear action prompts, not feed volume.

3. Activity should eventually become more actionable and less release-note-like.
   - Static app updates are helpful now but should expire/collapse later.

4. Skills need to drive matching.
   - Skills are beautiful, but the app should repeatedly answer: “who can help with this wish?”

5. Honey Pot should be more visible if trust/dues transparency matters.
   - Members should be able to easily see what changed and what they owe.

6. Meeting flow needs clear before/during/after states.
   - Especially “imported notes need Apply Notes” state.

## Recommended next steps

1. Review and commit the current local changes into a release-candidate branch.
2. Make sure the two untracked migrations and three untracked helper files are included if intended.
3. Lucas runs EAS TestFlight build.
4. Deploy Supabase migrations and functions.
5. Run the smoke test in `TESTFLIGHT_READINESS.md` on a real iPhone.
6. If the smoke test passes, invite a small pilot group first, not everyone.
7. Watch for three things during pilot:
   - Do people understand what to do after onboarding?
   - Do notifications bring them back to the right place?
   - Do wishes actually turn into help/actions?

## My current verdict

Code cleanliness: decent locally, not release-clean until committed and backend/function checks are verified.

TestFlight readiness: close, but dependent on Lucas/EAS + Supabase deployment + device smoke test.

App Store readiness: not yet. Needs TestFlight feedback, privacy/metadata polish, audit debt decision, and confidence that onboarding/notifications work for real users.

Product potential: high. The app is most likely to be successful if it doubles down on the wish/help/action loop and keeps Home focused on “what needs my attention today.”

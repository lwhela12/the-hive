# HIVE interest signups: local repair and release review

Status: local repair; release and live acceptance pending. The newsletter remains blocked until the live journey is accepted. Nothing in this document authorizes a deployment, real signup, invitation, email, or newsletter send.

## Scope and current source

Base: `e3106a38ac5ca29873b3fec7a8c4e643425e767e` on `lwhela12/the-hive/main`. Main and remote branch heads were checked before extending the isolated validator patch. There was no main-branch drift. Work stays on the isolated local `fix/interest-signups-preserve-hives` branch.

The two public entry points are:

- `https://the-hive.app/api/interested?hive=default` (Legacy uses this existing OG HIVE form).
- `https://the-hive.app/api/interested?hive=tech`.

Read-only GET checks during this review still found the malformed `/^[^@s]+@[^@s]+.[^@s]+$/` client pattern on both live pages. No POST was made to either live form. Broader branding is unchanged.

## Storage and admin handoff

The public handler calls `public.join_waitlist(text,text,text,text,text)` through the Supabase Data API using the configured anonymous key. The other writer is signed-in `app/join.tsx`, which inserts a general-interest row directly and expects the unique email constraint. The reviewed source has no waitlist email sender or notification trigger. "Let Nat know" currently means saving a request that owners read in Admin, not sending Nat an email.

The repair keeps one row per email, existing IDs, notes, source, creation time, status semantics, and the latest `interested_in` scalar for older clients. The additive `interest_slugs text[]` column accumulates explicit requests, with a distinct union inside the unique-email upsert. Repeats and concurrent requests retain both `default` and `tech`. Existing scalar interests are backfilled; already-overwritten historical interests cannot be recovered from the remaining row.

The Admin reader selects the new array and groups requests into every explicitly requested HIVE's existing Waiting folder. An invite or membership fulfils only that HIVE's explicit request. A general /join request retains its existing "fulfilled anywhere" semantics. Existing unique-name matching for alternate email addresses remains. The existing global `passed` status remains respected.

Admin reads still require the existing owner flag and RLS policies; ordinary community admins do not gain cross-HIVE access. The source defines owners as Nat and Lucas. This review did not query current production profiles or assume a fresh signed-in session. The button beside a waiting person still opens the invite form rather than sending an invite.

## Screen contract

- Public interest form: "How do I register interest in this HIVE?" Existing visible title and one interest button remain. Validation accepts the same email pattern as the server, shows progress, and confirms only a successful RPC result.
- Owner Admin Waiting folder: "Who is interested in this HIVE and still needs an invite?" The existing folder/list/action remain; the same dual-interest person may correctly appear in two different HIVE folders. Load failures now show an error instead of silently presenting an empty list.

No titles, navigation, layout, or promotional copy were added. Desktop/phone/landscape live visual acceptance remains pending; code tests alone are not a walkthrough pass.

## Local verification

From repository root, with Node 24:

```sh
node --test --test-reporter=tap site/tests/*.test.cjs hive-app/scripts/test-waitlist-admin.cjs
node --test --test-reporter=tap hive-app/scripts/test-waitlist-storage.cjs
```

The first command covers 29 form/newsletter-reader checks and eight admin checks. The second runs eight integration/storage checks against a new disposable Postgres 17 database. `initdb`, `pg_ctl`, and `psql` must be on PATH, or set `HIVE_TEST_PG_BIN` to their directory. This test listens on a private Unix socket only, uses synthetic `.invalid` addresses and local fixture identities, ignores password/service files, never uses a Supabase project, and stops/removes its database. It needs permission to create local shared memory on macOS; it is not a live signup test.

Storage tests execute the actual original waitlist DDL, owner function and RLS policies, then the actual new migration. They check legacy-row preservation/backfill; both signup orders; repeats; concurrency; passed status/notes/general /join compatibility; invalid email rejection; anonymous void response/no direct read; authenticated self-only read; owner read; migration idempotence; and actual emitted client script → handler → SQL RPC → owner Waiting folders.

App validation runs from `hive-app/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
CI=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=https://offline.invalid EXPO_PUBLIC_SUPABASE_ANON_KEY=offline-fixture EXPO_PUBLIC_BUILD_ID=local-interest-review npm run build:web
```

The build uses explicit offline placeholders and must never be deployed. Build release artifacts separately with the approved production environment after release authorization. The review package contains the actual outcomes and logs.

Recorded results: all 45 focused checks passed (29 form/newsletter-reader, eight Admin, eight real local-Postgres integration/storage). The complete `npm run typecheck` chain, strict isolated-module TypeScript check, and `npm run build:web` including export verification also passed. No live submission or signed-in visual acceptance was performed.

## Exact release targets and approval boundaries

The fix request authorizes this local implementation and local testing. It does not approve release. No later publication authorization was provided to this review.

1. **Database approval:** the HIVE production database used by `the-hive.app/api/interested`, specifically `public.waitlist` and its existing `public.join_waitlist` RPC. First verify the exact Supabase project ref from authorized deployment metadata; the checked-in code uses environment variable names and does not identify it. Apply only `20261105224426_preserve_waitlist_hive_interests.sql` in one transaction, with its five-second lock timeout. It adds/backfills `interest_slugs`, replaces the existing RPC body without changing its signature or ACL, and refreshes the Data API schema cache. It does not change RLS, grants, identity, membership, or send mail. Take an approved data-preserving snapshot first. Do not run a wholesale `supabase db push`: this repository documents a migration-history mismatch.
2. **App release approval:** build/release the reviewed `hive-app/` Admin reader to the `the-hive` project serving `https://app.the-hive.app`, after the migration. The new reader needs the column. Merging/pushing to main can trigger this project's automatic deployment and therefore also needs explicit approval.
3. **Public-site release approval:** release the reviewed `site/` validator to the separate `hive-public` project serving `https://the-hive.app`, deploying from `site/` only. No other site content needs changing. A whole project deployment includes all files in the submitted source, so confirm the final tree/target before release. The public site is not git-linked according to `site/README.md`.

The safest order is database → app reader → public validator, followed by read-only checks of the released source and pages. If app/site rollback is needed, retain the additive column and captured interests; do not destructively roll back the data fix.

## Smallest controlled live acceptance

After release approval and successful release verification, obtain separate approval for **one Nat-designated controlled test address** to submit interest on both exact links, creating/updating one real waitlist row. Confirm any live triggers/integrations first; none are present in the reviewed source, but production configuration has not been inspected. The expected consequence is one test row with both slugs, visible to Nat in both existing Waiting folders. Do not invite that address or send email. Agree any archival/status cleanup in the same approval; do not delete real data.

Nat's owner view must then confirm that both requests are visible and that handling one HIVE leaves the other actionable. Use an isolated test session that does not take over Nat's active browser, or ask her to perform the signed-in confirmation. Check desktop, phone and landscape before calling the UI accepted. Until this passes, live request-to-admin delivery and newsletter readiness remain unverified.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Postgres INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html), [Postgres array operators](https://www.postgresql.org/docs/current/functions-array.html).

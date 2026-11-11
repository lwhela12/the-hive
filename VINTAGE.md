# Tech HIVE

Branch: `tech-hive`. Base: `6f88c68e766a67f6b96a5c922faa4561a0c3b350` (November 11, 2026).

The 2026 baseline remains on `main`. Both the public website (`site/`) and member app (`hive-app/`) are in this repository. Last Day Libations already has its own repository.

## Direction

Tech HIVE evolves separately from the 2026 app and Legacy HIVE. Keep the ongoing community and profile continuity in mind; do not implement an annual Tech profile reset merely because Legacy has a 2027 vintage.

HIVE Approved is intended to persist with a bee in place of a member profile bubble. This application/data change is not implemented by creating the branches. Preserve historical member data; never delete it as a reset shortcut.

## Prepared here

- A separate source branch and app identity: Tech HIVE.
- Separate URL scheme and native package identifiers, so a future build does not overwrite the installed 2026 app. These identifiers have not been registered or deployed.
- Automatic Vercel Git deployments are disabled in this branch's config; no live project settings were changed.
- The inherited 2026 EAS project link and update URL have been removed; over-the-air updates are disabled until a separate launch is configured.
- The existing approved bee assets remain unchanged. New Legacy/2027 seals still need visual review.
- Run `node --test scripts/test-vintage-config.cjs` from `hive-app/` to verify this setup.

## Not yet launched

No separate backend, deployment or member-access boundary has been created. Supabase environment variables, member data, RLS and access remain unchanged. Separate app names do not prove data isolation. Do not connect a new branch to the live 2026 backend as a shortcut.

The November 10 public-site release is newer than this GitHub baseline. Recover and reconcile its complete source before deploying `site/`; this snapshot must not overwrite the newer live site.

Before launch, configure the intended hosting and data boundary deliberately, implement and test membership/cutover behavior, apply reviewed assets throughout the member experience, then run the repository's full checks and sign-in/access tests. No schema migration, member reset, deployment or access change is authorized merely by this file.

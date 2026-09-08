# HIVE brand — where everything lives

Read this before the first line of CSS on anything HIVE-shaped.

## The guideline

- **`HIVE Brand Guidelines - September 2026.pdf`** (this folder) — 8 pages, the one that counts.
- Drive original: https://drive.google.com/file/d/1z1KJocZzlmK_ok2cbT0zLSrNB0bFlYh2/view (in *HIVE Logo_Official*: https://drive.google.com/drive/folders/16dToIu_z8NwE0cQjbtZSWonPvvFs9tKn)
- `hive-app/assets/BRAND REFERENCE.pdf` is the January 2026 reference the September guide was built from. Superseded; kept for history.

## Palette

Core: Honey Gold `#BD9348` · Charcoal `#313130` · Soft Gold `#DEC181` · Cream `#F6F4E5` · White `#FFFFFF`.

Every branch is a pair — a dark environment and a light partner:

| branch | environment | partner |
|---|---|---|
| HIVE-Wide | Space `#050811` | Starlight `#F6F4E5` |
| OG HIVE | Honey `#BD9348` | Ink `#313130` |
| Tech HIVE | Circuit Navy `#011F46` | Signal Blue `#2F82C2` |
| Production HIVE | Stage Purple `#1F0338` | Curtain Violet `#A0708B` |

Charcoal on cream or white. Cream or white on Space, Circuit Navy or Stage Purple. Never mix branch colours or recolour one branch to stand in for another. Public scope has its own reserved teal `#0C7C7C` (`lib/scopeLook.ts`); no HIVE may take it.

In code: `hive-app/lib/theme.ts` (core palette), `hive-app/lib/hiveBrand.ts` (branch pairs, app), `hive-app/supabase/functions/_shared/hiveMark.ts` (branch pairs, email), `site/index.html` `:root` variables (public site).

## Type

- **Libre Baskerville** — headlines and branch names.
- **Lato** — body, UI, the motto.
- App: `@expo-google-fonts/libre-baskerville` + `@expo-google-fonts/lato` (see `hive-app/package.json`).
- Public site: subset `.woff2` files in `site/assets/` (`libre-baskerville-*.woff2`, `lato-*.woff2`).
- Emails: system stacks that fall back to Georgia / Helvetica; no webfont.

## Motto

`HUMAN • INSIGHT • VISION • EXECUTION` — uppercase, that order, centred bullets. Formal seal only.

## Seals and logos

- The size picks the seal, never taste: **formal (with motto) at 512px and up, simplified below 512px**. `hiveSealImg()` chooses.
- Served + bundled copies: `hive-app/public/logos/` (`og-hive`, `tech-hive`, `production-hive`, `hive-wide`, each `.png` simplified and `-formal.png`). `app.the-hive.app/logos/<name>.png` is what an email links to.
- Full export set (1254 / 1024 / 512 / 256 px): Drive *HIVE Logo_Official → Branch Logo Concepts - September 2026* https://drive.google.com/drive/folders/1_Rb8SheaZiq55uASWRYHgKzBdqkwzwkz — local mirror `~/HIVE/branch-logo-concepts-2026-09-04/`.
- Older marks still in deliberate use: the bee (app icon, splash, favicon — `hive-app/assets/`), the generic "THE HIVE" seal on the public site hero (`site/assets/seal.webp`), Clive's logo (`hive-app/assets/Clive_logo.png`).
- Keep one bee-head of clear space. Never stretch, crop, outline, add effects, a face, robot features, or a clapperboard.

## Voice

Warm, plain, short. Members are people, never "users". Say what someone can now do. The public site is warm daylight; The Nat Effect is a night garden and Saved You a Seat is a sunrise — three studio sites that share craft, not a look.

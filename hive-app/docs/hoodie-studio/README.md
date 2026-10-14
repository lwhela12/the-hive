# HIVE clothing configurator — local review

This is the authorized interactive ordering prototype for Nat's HIVE clothing.
It is saved in `codex/hoodie-ordering-prototype`, in the isolated worktree
`/Users/thenateffect/HIVE/the-HIVE-hoodie-studio`, based on main `689c8bc`.
The dirty authentication work in the original checkout is untouched.

## Review

Local review: http://127.0.0.1:8766/

If the temporary server has stopped, start it from the worktree root:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory hive-app/public/hoodie-studio
```

The existing Codex chat is **Improve HIVE hoodie ordering**,
`01a13b68-1249-76f3-8df9-82c1a630100c`.
A fresh supported task listing confirms project association
`local-8c63176ce86ffe6db235a0745831eaf0` (HIVE).
The supported navigation action returned `navigated: true`.
Earlier project-move calls reported “The project move was cancelled,
unsupported, or failed” and “The task belongs to a different host.”
The later verified project metadata supersedes those errors.
No duplicate task or direct state-database edits were used.

## Screen contracts

| Member's question | Visible title | Next action | Supporting detail |
| --- | --- | --- | --- |
| Which garment fits how I want it to feel? | Choose your style | Choose one of six garments | Both quarter-zips together; weight, blend, fit, feel; finish guide opens separately |
| Which neutral color and size can I request? | Choose your color & size | Choose color, size and quantity | Exact availability narrows by provider and finish; size chart links to the model |
| What can go on this garment, and where? | Make it yours | Choose compatible finish, artwork and optional name | Constrained placements, font and text color; live photo/study preview; front/back and enlargement |
| Are these the selections I want Nat to prepare? | Review your picks | Save locally or download/share selections | OG dues / non-OG at cost; Nat rechecks stock and confirms the Printify screenshot |

One title per step. Page explanation, production caveats and repeated guide
headings are kept out of the masthead. Finish explanations live by the controls
and in one shared guide. Stock freshness lives beside selection and review.
The product-preview label, reference-shade label and final-proof note explain
what the visible image can support.

## Implementation

- `public/hoodie-studio/index.html`: standalone entry, semantic page structure, dialogs.
- `public/hoodie-studio/studio.css`: existing HIVE palette/type, responsive layout, compact sticky phone preview, reduced motion.
- `public/hoodie-studio/catalog.mjs`: dated provider/color/size/finish/placement records and normalization.
- `public/hoodie-studio/studio.mjs`: dependent controls, artwork overlays, constrained name placement, persistence, text download.
- `public/hoodie-studio/assets/`: original guide artwork/reference photos, verified manufacturer/Printify photos, existing HIVE fonts, complete Courgette font/license, source manifest.
- `scripts/test-hoodie-studio.mjs`: catalog and invalid-combination boundary tests.
- `scripts/verify-hoodie-studio-browser.cjs`: isolated browser journeys, screenshots, local save/download and responsive checks.

This static prototype needs no new package dependencies or build transform.
There are no account calls, payment controls, order calls, vendor contacts,
automatic messages or external integrations. Browser requests are local assets.
The existing app's auth, navigation, surveys, Honey Pot calculation, package
files and database remain untouched. Existing announcements and cost logic
were inspected for context, rather than changed into a competing flow.

## Catalog evidence

Snapshot: **October 14, 2026**, forwarded from official Printify provider tables.
It is a catalog snapshot, rather than a live inventory service.
Records remain separate per provider and finish. Changing a choice normalizes
incompatible fields before review becomes available.

| Model | Included neutral records |
| --- | --- |
| Gildan SF008 | Choice DTG: Black / Sand / Off White, S–3XL |
| Hanes OG900 | Fulfill Engine DTF: Black, S–3XL; no embroidery |
| Gildan 18500 | Choice DTG: Black / White / Sand, S–5XL; Fulfill Engine embroidery: Black / Sand S–5XL, White S–3XL and 5XL (4XL absent) |
| Gildan 18600 | SwiftPOD DTG and Fulfill Engine embroidery: Black S–5XL, White S–3XL; unstocked White 4XL/5XL excluded |
| Bella+Canvas 3719 | Fulfill Engine DTF: Black / White / Vintage White XS–3XL; Natural S–3XL; Tan XS/S/M/XL/3XL; Heather Dust XS/S/XL |
| Gildan 18000 | Choice DTG: Black / White S–5XL, Sand S–3XL; Fulfill Engine embroidery: Black / White / Sand S–3XL |

The chosen provider's known decoration areas are conservatively narrowed to
useful clothing placements. Extra label/wrist/provider variants are not
invented. Detailed embroidered seals are held until adapted artwork exists;
the existing simple bee and name-only choices are available as design intents.
Nat confirms digitizing, thread shades and final placement in Printify.

Puff is explained accurately as editor-made raised heat-transfer text.
It remains unselectable until an exact neutral provider/size/placement/font
record is supplied. Uploaded-logo puff and 3D embroidery are never offered.

The exact provider shade names are preserved. “Beige” is not substituted for
Natural, Tan, Sand or Off White. Out-of-stock French Vanilla and Heather Sand
Dune are excluded. The focused palette does not include additional black
heather shades or gray/navy Hanes variants.

Fabric specifications were checked against the linked official Printify model
pages and Bella+Canvas's manufacturer page. The 3719 weight discrepancy remains
visible: Printify 7 oz/yd², manufacturer 8 oz/yd². Warmth is described through
relative weight and coverage, rather than a temperature rating.
The finish guide's wash estimates come from the current HIVE guide's Printify
references and are qualified as general method guidance, with no garment or
provider durability guarantee.

## Artwork and photography

Original guide: Library `libfile_aeb4e5a34d54819195916f3e62c61d41`, version 2,
backing file `file_00000000ae6881fba88234377bedd9b5`.
The authorized materialization transfer was downloaded through its returned
signed URL to `/Users/thenateffect/HIVE/hoodie-review-reference/original-guide.pdf`.
Verified size: 10,521,367 bytes. Five pages rendered and inspected.
The source manifest records its SHA-256 and PDF image references.

Seven guide logos remain available with their original colors.
The existing site's transparent bee is reused in the preview so the original
guide's white image background does not become an invented print rectangle.
Libre Baskerville and Lato files come from the existing HIVE site.
Courgette uses the complete official Google Fonts release with its OFL;
the PDF embedded only a sample font unsuitable for arbitrary names.

Verified selected-color photos are bundled for Hanes Black (front/back) and
Bella+Canvas Black (front/back), White, Natural, Vintage White and Tan (front).
No photograph is synthetically recolored. The original model photos remain
visibly labeled by their actual reference shade. If the exact color/view photo
is absent, the preview becomes an explicitly labeled code-drawn study, with
the original photograph available separately.

**Remaining photography work:** replace the original Gildan reference shots
with forwarded, matching neutral front/back catalog images when available.
Until then, the six-card layout and labeling are consistent, while the original
photography differs in pose/background. This is not a completed uniform photo
set. Overlays and sketches always require Nat's final Printify screenshot.

## Verification

October 14 review correction: the preselection preview now uses an explicitly
labeled real reference photo for every garment, rather than an invented sand
study. A sole supported palette color is selected automatically when choosing
the garment, so Hanes opens with its actual Black photo and enabled sizes.
Comparison counts and the color step explicitly identify the neutral palette.
Hanes's other catalog colors (Ash, Charcoal Heather, Athletic Navy) are named
separately from selectable, verified palette records. The official Printify
listing was rechecked and lists four colors through Fulfill Engine DTF.
No additional unverified color/size variants were made selectable.
Correction evidence: `/Users/thenateffect/HIVE/hoodie-color-fix-evidence`.

Run the focused catalog checks:

```sh
node --test hive-app/scripts/test-hoodie-studio.mjs
node --check hive-app/public/hoodie-studio/catalog.mjs
node --check hive-app/public/hoodie-studio/studio.mjs
node hive-app/scripts/lint-page-headers.mjs
git diff --check
```

The browser verifier takes an existing Playwright installation and optional
Chromium executable via `HIVE_PLAYWRIGHT_MODULE` and
`HIVE_CHROMIUM_EXECUTABLE`. `HIVE_STUDIO_EVIDENCE` chooses the screenshot folder.
It always launches a new headless browser and fresh profile. No Nat browser,
desktop browser tabs, account profile, clipboard or device is inspected.

Evidence is saved in `/Users/thenateffect/HIVE/hoodie-review-evidence`.
Final local pass: **11 catalog boundary tests passed**, module syntax checks
passed, page-header lint passed, diff whitespace check passed, and the browser
journey suite passed with zero JavaScript errors and local-only requests.
Checks cover desktop 1440×1000, 1024×768, tablet 768×1024, and widths around
responsive boundaries: 640×800, 560×844, phone 390×844, 320×640 and landscape
844×390. Journey checks cover conditional sizes/finishes, all Hanes placements,
separate name placement, both garment sides, photo/study views, enlargement,
finish guide, name-only selection, exact name/font/color, local save/readback,
downloaded selection text and horizontal overflow. Browser requests must remain
local and JavaScript errors must be absent.

This verifies the review prototype. Full Expo/native build and signed-in
integration are not claimed; another evaluator owns baseline dependency/test
repair. No deployment, push, merge, purchase or vendor contact occurred.

## Next boundary

Current phase: review the configurator's visual flow and selection behavior.
After Nat's review: consume the remaining exact puff/photo evidence, decide
whether to add a canonical signed-in clothing destination using the existing
AppHeader/SideRail, and agree how member submissions reach Nat.
Any later integration preserves the dues/at-cost workflow and Printify
screenshot confirmation. Payments and automatic ordering require a separate
explicit decision.

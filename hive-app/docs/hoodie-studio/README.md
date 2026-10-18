# HIVE clothing configurator — local review

This is the authorized interactive ordering prototype for Nat's HIVE clothing.
It is saved in `codex/hoodie-ordering-prototype`, in the isolated worktree
`/Users/thenateffect/HIVE/the-HIVE-hoodie-studio`, based on main `689c8bc`.
The dirty authentication work in the original checkout is untouched.

## Review

Local review: http://127.0.0.1:8766/

Production route after the authorized app release:
https://app.the-hive.app/hoodie-studio/

That production route is now the single URL used by the quarter announcement,
the hoodie-board cleanup migration and Clive's ordering guidance. The Vercel
configuration routes both `/hoodie-studio` and `/hoodie-studio/` to the static
configurator. This branch does not deploy it.

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
| Which garment fits how I want it to feel? | Choose your style | Choose from eight garments | Two each of quarter-zips, hoodies, crewnecks and full-zips; quarter-zips side by side |
| Which neutral color and size can I request? | Choose your color & size | Choose color, size and quantity | Exact availability narrows by provider and finish; size chart links to the model |
| What can go on this garment, and where? | Make it yours | Choose compatible finish, artwork and optional name | Constrained placements, font and text color; live photo/study preview; front/back and enlargement |
| Are these the selections I want Nat to prepare? | Review your picks | Save locally or download/share selections | OG dues / non-OG at cost; Nat rechecks stock and confirms the provider screenshot |

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

The original six model records are from **October 14, 2026**. The added crewneck
and full-zip records were checked against public Printify listings on
**October 18, 2026**. This is a catalog snapshot, rather than a live inventory
service.
Records remain separate per provider and finish. Changing a choice normalizes
incompatible fields before review becomes available.

| Model | Included neutral records |
| --- | --- |
| Bella+Canvas 4740 | Dust, XS–4XL. Printify Fulfill Engine DTG/DTF on back/sleeves; Printful embroidery on left/right chest or wrists (Printful through 3XL) |
| Hanes OG900 | Fulfill Engine DTF: Black, S–3XL; no embroidery |
| Gildan 18500 | Choice DTG: Black / White / Sand, S–5XL; Fulfill Engine embroidery: Black / Sand S–5XL, White S–3XL and 5XL (4XL absent) |
| Gildan 18600 | SwiftPOD DTG and Fulfill Engine embroidery: Black S–5XL, White S–3XL; unstocked White 4XL/5XL excluded |
| Bella+Canvas 3719 | Fulfill Engine DTF: Black / White / Vintage White XS–3XL; Natural S–3XL; Tan XS/S/M/XL/3XL; Heather Dust XS/S/XL |
| Gildan 18000 | Choice DTG: Black / White S–5XL, Sand S–3XL; Fulfill Engine embroidery: Black / White / Sand S–3XL |
| Independent Trading Co. IND5000C | Fulfill Engine DTG and DTF: Black / White / Bone XS–3XL; front / back / sleeve print areas; no embroidery |
| Lane Seven LS14003 | Fulfill Engine: Black / White / Oatmeal Heather XS–3XL; DTF chest/wrists and DTG back. Printful: Black S–3XL; embroidery at left chest and large back, including the black-on-black chest + back request |

## Price guidance

The form shows public **USD starting prices**, an estimated merchandise subtotal
for the chosen quantity, and the published starting shipping price. It does not
present those figures as a checkout quote. Size, color, technique, placement,
tax and current provider pricing can change the final amount; Nat confirms the
exact at-cost amount in the same provider screenshot used to approve the design.
OG HIVE coverage through Honey Pot dues and non-OG HIVE payment at cost remain
unchanged. The prototype has no payment or ordering controls.

Starting prices checked October 18, 2026: Gildan 18500 $21.58; Bella+Canvas
4740 $38.96 through Printful or $47.37 through Printify Fulfill Engine; Gildan
18600 $28.63; Bella+Canvas 3719 $37.55; Gildan 18000 $17.87; Hanes OG900
$58.80; Independent IND5000C $51.21; Lane Seven LS14003 $27.49 through
Printful or $32.43 through Printify Fulfill Engine. Printful includes one
decoration in its displayed product price and may add $6.50 per uploaded
embroidery file for first-time digitization. A second embroidery placement,
including Meg's large back, costs extra; the provider determines that amount.

The chosen provider's known decoration areas are conservatively narrowed to
useful clothing placements. Extra label/wrist/provider variants are not
invented. Detailed embroidered seals are held until adapted artwork exists;
the existing simple bee and name-only choices are available as design intents.
Nat confirms digitizing, thread shades and final placement in Printify.

Puff is explained accurately as editor-made raised heat-transfer text.
It remains unselectable until an exact neutral provider/size/placement/font
record is supplied. Uploaded-logo puff and 3D embroidery are never offered.

The exact provider shade names are preserved. “Beige” is not substituted for
Natural, Tan, Sand, Off White, Bone or Oatmeal Heather. Out-of-stock French
Vanilla and Heather Sand Dune are excluded. The focused palette does not
include additional black heather shades or gray/navy Hanes variants.

The expanded October 18 check found a substantially better light quarter-zip:
the Bella+Canvas 4740 in Dust. It is 10 oz/yd² (339 gsm) brushed three-end
fleece, between the 8.4 oz Gildan and 13 oz Hanes. Printify's Fulfill Engine
listing offers Dust in XS–4XL with DTG/DTF on the back or sleeves. Printful's
listing offers the same blank through 3XL with left-chest embroidery and no
minimum. The 4740 replaces the lighter Gildan SF008 in the two-option
quarter-zip comparison.

No 13 oz quarter-zip in a cream shade was found: the 13 oz Hanes OG900 listing
shows Black, Ash, Charcoal Heather and Athletic Navy. The closest light-color
garment at or above that weight remains the IND5000C crewneck in Bone at 13.5
oz. It is a crewneck and the checked Fulfill Engine option has DTG/DTF, without
embroidery.

[Printful's Lane Seven LS14014](https://www.printful.com/custom/mens/hoodies-sweatshirts/unisex-premium-quarter-zip-sweatshirt-lane-seven-ls14014)
is a lighter cream-adjacent alternative: its Sandshell shade is listed in
S–3XL, with left-chest embroidery or DTFlex, but the garment is 8.25 oz/yd².
[Printful's Comfort Colors 1580 quarter-zip](https://www.printful.com/custom/collections/sportswear/unisex-garment-dyed-quarter-zip-sweatshirt-comfort-colors-1580)
is 9.5 oz/yd² and DTF-only. Neither matches the Hanes's 13 oz weight.

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
Until then, the eight-card layout and labeling are consistent, while the original
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
The current catalog passed **14 boundary and price tests**, module syntax
checks, page-header lint and diff whitespace checks. The earlier six-style
baseline passed the full browser journey suite. The updated eight-style price page was visually reviewed in a
fresh isolated headless browser at 1440 px and 390 px: all eight cards showed
starting prices, Meg's quantity-two Printful review showed the $27.49 item
start and $54.98 merchandise subtotal, and the phone viewport had no horizontal
overflow. Review captures are in this folder as `pricing-style-review.png`,
`pricing-meg-review.png`, and `pricing-meg-mobile-review.png`.

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

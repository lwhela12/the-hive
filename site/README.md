# the-hive.app — the public site

Plain HTML/CSS, no build step. The members' app is separate, in `hive-app/`,
and lives at app.the-hive.app.

- `index.html` — the whole page; CSS inline at the top, JS at the bottom
- `assets/` — the seal, and Libre Baskerville + Lato subset to the characters used

## The background

Two canvases behind everything: a honeycomb lattice painted once per resize
(and faded out toward the middle so it never fights the type), and drifting
pollen on the animated one. Honours `prefers-reduced-motion`.

## Deliberately a different world

The Nat Effect is a night garden, Saved You a Seat is a sunrise, this is warm
daylight. Three studio sites that share craft but not a look.

## Careful with DNS

`the-hive.app` DNS is already on Vercel nameservers. Three records on it belong
to **Resend** and must never be deleted — `send` MX, `send` TXT (SPF), and
`resend._domainkey` TXT. They are on the `send` subdomain, so a plain
`dig MX the-hive.app` shows nothing. HIVE's email breaks without them.

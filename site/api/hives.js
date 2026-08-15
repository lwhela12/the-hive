// Every HIVE that a stranger could put their hand up for.
//
// Built 2026-08-14, when the public site still carried a hardcoded list of two
// HIVEs in two different places. Nat: *"don't reword it for three, just reword
// it for multiple, that way we don't have to keep going and adding it every
// time we make a change."*
//
// So the site asks, rather than being told. A HIVE created tomorrow appears
// here the moment it exists, with its own name and its own colour, and nobody
// edits a file.
//
// Reads the `public_hives` VIEW, never the `communities` table. That table
// also carries `meeting_helper_notes` — the notes Nat types live during a
// meeting — plus slide deck URLs and honey-pot settings, and row-level
// security grants whole rows. The view (migration 181) is the security
// boundary: slug, name and accent colour, all three of which are already
// printed on this site, in The Buzz and on every invite email.
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Content-Type', 'application/json');
  // A minute is long enough to spare the database a hammering and short
  // enough that a new HIVE shows up while Nat is still looking at the page.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  if (!url || !key) return res.status(200).json({ hives: [] });

  try {
    const r = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/public_hives?select=slug,name,accent_color`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return res.status(200).json({ hives: [] });
    const rows = await r.json();
    return res.status(200).json({
      hives: (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.slug && row?.name)
        .map((row) => ({
          slug: String(row.slug),
          name: String(row.name),
          colour: String(row.accent_color || '#bd9348'),
        })),
    });
  } catch {
    return res.status(200).json({ hives: [] });
  }
}

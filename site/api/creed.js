// The HIVE Creed, read from the one pinned HIVE-Wide page that Nat edits.
//
// The database view is the privacy boundary: it exposes only the Creed's words
// and edit time. Replies, authors, members and all other board content stay shut.
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  if (!url || !key) return res.status(200).json({ creed: null, reason: 'not_configured' });

  try {
    const r = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/public_hive_creed?select=content,updated_at&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return res.status(200).json({ creed: null, reason: 'read_failed' });

    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.content) return res.status(200).json({ creed: null });

    return res.status(200).json({
      creed: { content: String(row.content), updated: row.updated_at || null },
    });
  } catch {
    return res.status(200).json({ creed: null, reason: 'read_failed' });
  }
}

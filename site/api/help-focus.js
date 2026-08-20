// This month's HIVE Help focus, straight from the members' app.
//
// An owner reviews the focus for the public site, so a neighbour who isn't in
// a HIVE can still drop off a donation or turn up on the day.
//
// Reads public.public_help_focus, a view that returns at most one row — the
// newest focus somebody marked public — and only its title, body and date.
// Replies stay inside the HIVE: members logging their own acts of kindness is
// their business. See migration 119 in the app repo.
//
// Shares SUPABASE_URL and SUPABASE_ANON_KEY with the events endpoint.

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  if (!url || !key) {
    return res.status(200).json({ focus: null, reason: 'not_configured' });
  }

  const query =
    `${url.replace(/\/$/, '')}/rest/v1/public_help_focus` +
    `?select=id,title,content,created_at&limit=1`;

  try {
    const r = await fetch(query, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('public_help_focus read failed', r.status, detail.slice(0, 300));
      return res.status(200).json({ focus: null, reason: 'read_failed' });
    }

    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(200).json({ focus: null });

    return res.status(200).json({
      focus: { title: row.title, body: row.content, since: row.created_at },
    });
  } catch (err) {
    console.error('public_help_focus threw', err);
    return res.status(200).json({ focus: null, reason: 'read_failed' });
  }
}

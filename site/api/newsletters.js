// Published newsletters, for anyone who wants to read before subscribing.
//
// Wix let strangers read the newsletter because it was a blog. That went missing
// in the move, and it's most of why signing up felt like a leap of faith — you
// were asked to commit to something you couldn't see (Nat 2026-08-01).
//
// Reads public.public_newsletters: only posts on a newsletter board, only those
// marked public, and only from HIVEs whose ceiling reaches the public. The
// board_posts table itself stays shut to anonymous visitors.

const LIMIT = 12;

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  if (!url || !key) {
    return res.status(200).json({ newsletters: [], reason: 'not_configured' });
  }

  try {
    const r = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/public_newsletters` +
      `?select=id,title,content,created_at&limit=${LIMIT}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('public_newsletters read failed', r.status, detail.slice(0, 300));
      return res.status(200).json({ newsletters: [], reason: 'read_failed' });
    }

    const rows = await r.json();
    const newsletters = (Array.isArray(rows) ? rows : []).map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      date: n.created_at,
    }));

    return res.status(200).json({ newsletters });
  } catch (err) {
    console.error('public_newsletters threw', err);
    return res.status(200).json({ newsletters: [], reason: 'read_failed' });
  }
}

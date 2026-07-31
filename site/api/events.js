// Upcoming public events, straight from the members' app.
//
// A member flips an event to "Everyone's invited" in the app and it appears
// here — no second place to publish it, no copying by hand (Nat 2026-07-31).
//
// This reads public.public_events, a database view that exists only for this
// page. It exposes seven hand-picked columns over public, upcoming events and
// nothing else, so the worst a bad request here can do is show an event that
// was already marked public. The events table itself stays closed to anonymous
// visitors — see migration 118 in the app repo.
//
// Needs SUPABASE_URL and SUPABASE_ANON_KEY on the hive-public Vercel project.
// Without them this returns an empty list and the page says so politely.

const LIMIT = 6;

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  // Cache at the edge: a calendar that is a few minutes stale is fine, and it
  // keeps a busy page from hammering the database.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  if (!url || !key) {
    return res.status(200).json({ events: [], reason: 'not_configured' });
  }

  const query =
    `${url.replace(/\/$/, '')}/rest/v1/public_events` +
    `?select=id,title,description,event_date,end_date,event_time,location` +
    `&order=event_date.asc&limit=${LIMIT}`;

  try {
    const r = await fetch(query, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('public_events read failed', r.status, detail.slice(0, 300));
      return res.status(200).json({ events: [], reason: 'read_failed' });
    }

    const rows = await r.json();
    const events = (Array.isArray(rows) ? rows : []).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.event_date,
      end: e.end_date,
      time: e.event_time,
      location: e.location,
    }));

    return res.status(200).json({ events });
  } catch (err) {
    console.error('public_events threw', err);
    return res.status(200).json({ events: [], reason: 'read_failed' });
  }
}

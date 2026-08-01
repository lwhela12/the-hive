// Newsletter sign-ups from the public site.
//
// This used to open the visitor's mail app and compose a message to Nat, which
// meant the list lived in an inbox. Now it calls subscribe_to_newsletter, a
// database function that adds an address and hands nothing back — see migration
// 123 in the app repo. There is no request anyone can make here that returns
// who else is subscribed.
//
// Needs SUPABASE_URL and SUPABASE_ANON_KEY on the hive-public Vercel project,
// the same two the events feed already uses.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const email = String(body.email || '').trim();
  const name = String(body.name || '').trim();

  // Bots fill hidden fields. Say yes and do nothing.
  if (body.company) return res.status(200).json({ ok: true, subscribed: true });

  if (!EMAIL.test(email) || email.length > 254) {
    return res.status(400).json({ ok: false, reason: 'bad_email' });
  }

  if (!url || !key) {
    return res.status(200).json({ ok: false, reason: 'not_configured' });
  }

  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/subscribe_to_newsletter`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_email: email, p_name: name || null }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('subscribe failed', r.status, detail.slice(0, 300));
      return res.status(200).json({ ok: false, reason: 'write_failed' });
    }

    return res.status(200).json({ ok: true, subscribed: true });
  } catch (err) {
    console.error('subscribe threw', err);
    return res.status(200).json({ ok: false, reason: 'write_failed' });
  }
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

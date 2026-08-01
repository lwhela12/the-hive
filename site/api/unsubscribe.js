// One click and they're out.
//
// Every newsletter carries a link to this with the reader's own key on it. It
// answers with a plain page rather than JSON, because the person clicking is a
// human who wants to be told it worked — and because a link that lands on raw
// JSON reads like something went wrong.
//
// Deliberately no confirm step. Making someone prove they meant it is how you
// end up in a spam folder.

const PAGE = (title, body) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — HIVE</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    background:#f6f4e5;color:#313130;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px}
  .card{max-width:30rem;text-align:center;background:#fffdf5;
    border:1px solid rgba(189,147,72,.28);border-radius:18px;padding:40px 32px;
    box-shadow:0 16px 44px rgba(138,106,47,.10)}
  h1{font-family:Georgia,serif;font-size:1.5rem;margin:0 0 12px}
  p{line-height:1.65;color:#5c5a54;margin:0 0 8px}
  a{color:#8a6a2f}
</style>
</head><body><div class="card">${body}</div></body></html>`;

export default async function handler(req, res) {
  const token = String((req.query && req.query.token) || '').trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!token || !url || !key) {
    return res.status(200).send(PAGE('Unsubscribe', `
      <h1>We couldn't read that link</h1>
      <p>It may have been broken in half by an email app. Reply to any HIVE
      newsletter and we'll take you off by hand.</p>`));
  }

  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/unsubscribe_from_newsletter`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });

    const removed = r.ok ? await r.json().catch(() => false) : false;

    if (removed === true) {
      return res.status(200).send(PAGE('Unsubscribed', `
        <h1>You're off the list</h1>
        <p>No more HIVE newsletters. Thanks for having read them.</p>
        <p>Changed your mind? <a href="/#involved">Sign up again any time.</a></p>`));
    }

    // The key matched nobody. Usually a link mangled in transit.
    return res.status(200).send(PAGE('Unsubscribe', `
      <h1>We couldn't read that link</h1>
      <p>Email apps sometimes break long links in half. Reply to any HIVE
      newsletter and we'll take you off by hand.</p>
      <p><a href="/">Back to HIVE</a></p>`));
  } catch (err) {
    console.error('unsubscribe threw', err);
    return res.status(200).send(PAGE('Unsubscribe', `
      <h1>Something went wrong at our end</h1>
      <p>Reply to any HIVE newsletter and we'll take you off by hand.</p>`));
  }
}

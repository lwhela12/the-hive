// "I'm interested in Tech HIVE" — one tap from the newsletter.
//
// Built 2026-08-12 for the August issue, which opens Tech HIVE to the whole
// list. Nat was clear that she does NOT want an "I'm interested in…" section
// living on the public site: *"No thanks. only this one time in this one
// newsletter, since its a big 'overhaul' one."* So this is a landing page for
// a link, not a form on a page anybody browses — nothing on the-hive.app
// points at it, and it carries `noindex`.
//
// Answers with a plain page rather than JSON for the same reason
// api/unsubscribe.js does: a human is clicking, and raw JSON reads like a
// breakage.
//
// TWO STEPS, deliberately, where unsubscribe has one. Unsubscribe makes
// nobody prove they meant it, because friction there is how you earn a spam
// report. This one is the opposite: the link carries the reader's address,
// and newsletters get forwarded. Landing straight on "you're on the list"
// would put whoever the email was forwarded TO onto Nat's waitlist under the
// original reader's name. So the first tap shows the address and asks, and
// the second tap is the yes. Still no typing.

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
  .who{font-weight:600;color:#313130}
  button{margin-top:18px;border:0;border-radius:999px;background:#bd9348;
    color:#fffdf5;font-size:1rem;font-weight:700;padding:13px 26px;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
</style>
</head><body><div class="card">${body}</div></body></html>`;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  const q = req.query || {};
  const email = String(q.email || '').trim().toLowerCase();
  const hive = String(q.hive || '').trim().toLowerCase() || null;
  const name = String(q.name || '').trim();

  res.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  // No address on the link means they came from the public site's copy of
  // the letter (the email version always carries one). Ask for it — one
  // field, then the same two-tap confirm as everyone else.
  if (!EMAIL.test(email) || email.length > 254) {
    if (req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({ ok: false });
    }
    const hiveLabelAsk = hive === 'tech' ? 'Tech HIVE' : 'HIVE';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(PAGE(hiveLabelAsk, `
      <h1>Want in on ${escapeHtml(hiveLabelAsk)}?</h1>
      <p>Pop your email in and we'll let Nat know you're interested.</p>
      <input id="em" type="email" placeholder="you@example.com" autocomplete="email"
        style="margin-top:14px;width:100%;max-width:20rem;padding:12px 14px;border:1px solid rgba(189,147,72,.4);border-radius:12px;font-size:1rem;" />
      <div><button id="go" type="button">Yes, I'm interested</button></div>
      <p id="out" style="margin-top:16px"></p>
      <script>
        var go = document.getElementById('go'), out = document.getElementById('out'), em = document.getElementById('em');
        go.addEventListener('click', function () {
          var v = (em.value || '').trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { out.textContent = 'That email looks off — check it and try again.'; return; }
          go.disabled = true; out.textContent = 'One moment…';
          var qs = new URLSearchParams(window.location.search); qs.set('email', v);
          fetch(window.location.pathname + '?' + qs.toString(), { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.ok) { go.style.display = 'none'; em.style.display = 'none'; out.innerHTML = "You're on the list \u{1F41D} Nat will be in touch."; }
              else { go.disabled = false; out.textContent = 'That did not go through. Try once more.'; }
            })
            .catch(function () { go.disabled = false; out.textContent = 'That did not go through. Try once more.'; });
        });
      </script>`));
  }

  // The yes.
  if (req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    if (!url || !key) return res.status(500).json({ ok: false });
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/join_waitlist`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_email: email,
          p_name: name || null,
          p_interested_in: hive,
          p_source: 'newsletter',
        }),
      });
      return res.status(200).json({ ok: r.ok });
    } catch {
      return res.status(200).json({ ok: false });
    }
  }

  // The ask.
  const safeEmail = escapeHtml(email);
  const hiveLabel = hive === 'tech' ? 'Tech HIVE' : 'HIVE';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(PAGE(hiveLabel, `
    <h1>Want in on ${escapeHtml(hiveLabel)}?</h1>
    <p>We'll let Nat know you're interested, using this address:</p>
    <p class="who">${safeEmail}</p>
    <button id="go" type="button">Yes, I'm interested</button>
    <p id="out" style="margin-top:16px"></p>
    <script>
      var go = document.getElementById('go'), out = document.getElementById('out');
      go.addEventListener('click', function () {
        go.disabled = true; out.textContent = 'One moment…';
        fetch(window.location.pathname + window.location.search, { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok) {
              go.style.display = 'none';
              // No "before the next meeting" — Nat, 2026-08-12: "lets not make
              // promises." A page cannot commit her to a deadline.
              out.innerHTML = "You're on the list \\u{1F41D} Nat will be in touch.";
            } else {
              go.disabled = false;
              out.textContent = 'That did not go through. Try once more, or just reply to the newsletter.';
            }
          })
          .catch(function () {
            go.disabled = false;
            out.textContent = 'That did not go through. Try once more, or just reply to the newsletter.';
          });
      });
    </script>`));
}

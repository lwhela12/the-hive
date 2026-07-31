// Contact form handler for the-hive.app.
//
// Sends through Resend, using RESEND_API_KEY on the hive-public Vercel project.
//
// The from-address must be on the-hive.app itself. send.the-hive.app carries the
// SPF and MX records Resend uses for the return path, but it is not a verified
// sending domain — Resend answers "the send.the-hive.app domain is not verified"
// to anything posted from it.
//
// Until the key exists this returns { sent: false }, and the page quietly falls
// back to opening the visitor's mail app, so the form never dead-ends.

const TO = 'NatWalstead@gmail.com';
const FROM = 'HIVE <hello@the-hive.app>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sent: false, reason: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim();
  const message = String(body?.message || '').trim();
  const honeypot = String(body?.company || '').trim();

  // A bot filled the hidden field. Look successful and drop it.
  if (honeypot) return res.status(200).json({ sent: true });

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ sent: false, reason: 'incomplete' });
  }
  if (message.length > 5000 || name.length > 200) {
    return res.status(400).json({ sent: false, reason: 'too_long' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(200).json({ sent: false, reason: 'not_configured' });

  const escape = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: `Honey, we have a message! 🍯 — ${name}`,
        html:
          `<p><strong>${escape(name)}</strong> &lt;${escape(email)}&gt; wrote:</p>` +
          `<p style="white-space:pre-wrap">${escape(message)}</p>` +
          `<p style="color:#8e7a5e;font-size:12px">Sent from the-hive.app</p>`,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('resend failed', r.status, detail.slice(0, 300));
      return res.status(200).json({ sent: false, reason: 'send_failed' });
    }
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('resend threw', err);
    return res.status(200).json({ sent: false, reason: 'send_failed' });
  }
}

// The one public form on the-hive.app. Nat, 7 Sep 2026: every public site
// gets the same short form — name, email, "How can we help?", message, Send —
// and the pick lands in the studio inbox as "<Topic> — HIVE", so the weekly
// tally can count wish mail by subject alone. Replaces api/contact.js.
//
// Sends through Resend, using RESEND_API_KEY on the hive-public Vercel project.
// The from-address must be on the-hive.app itself. send.the-hive.app carries
// the SPF and MX records Resend uses for the return path, but it is not a
// verified sending domain.

const PRODUCT = 'HIVE';
const FROM = 'HIVE <hello@the-hive.app>';
const TO = ['savedyouaseatstudios@gmail.com'];
const CC = ['natwalstead@gmail.com'];
// The bot trap. Never "company" — Chrome fills that from a saved address and
// real people tripped it (Nat, 2026-08-03, first thing she tested).
const HONEYPOT = 'hive-jar';
const LOGO = 'https://the-hive.app/assets/hive-logo-email.png';

// The subject words are exact — the tally greps "Wait list —" and "Wish —".
const TOPICS = {
  wish:     { subject: 'Wish',     label: "Wishlist: something I'd love to see", needsMessage: true },
  question: { subject: 'Question', label: 'A question',                        needsMessage: true },
  hello:    { subject: 'Hello',    label: 'Just saying hello',                 needsMessage: false },
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A few tries per address, so one bored bot cannot fill the inbox. In memory,
// per warm instance; it resets whenever the instance does.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map();
function overLimit(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return true; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // A bot filled the hidden field. Look successful and drop it.
  if (body[HONEYPOT]) return res.status(200).json({ ok: true });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overLimit(ip)) return res.status(429).json({ error: 'That is a few tries in a row. Please come back shortly.' });

  const name = String(body.name || '').trim().slice(0, 200);
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const topic = TOPICS[String(body.topic || '')];

  if (!topic) return res.status(400).json({ error: 'Pick what this is about.' });
  if (!name) return res.status(400).json({ error: 'Please add your name.' });
  if (!email || email.length > 254 || !EMAIL.test(email)) return res.status(400).json({ error: "That email doesn't look right." });
  if (topic.needsMessage && !message) return res.status(400).json({ error: 'Please add a line so we know what you mean.' });
  if (message.length > 5000) return res.status(400).json({ error: 'That message is a bit long. Trim it and try again.' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });

  const subject = `${topic.subject} — ${PRODUCT}`;
  const text = `Name: ${name}\nEmail: ${email}\nTopic: ${topic.label}\nMessage: ${message || '(none)'}`;
  const row = (k, v) =>
    `<tr><td style="padding:6px 14px 6px 0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a6a2f;vertical-align:top;white-space:nowrap">${k}</td>` +
    `<td style="padding:6px 0;font-size:15px;color:#313130;vertical-align:top">${v}</td></tr>`;
  const html = `
    <div style="background:#f6f4e5;padding:28px 16px;font-family:Lato,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#313130">
      <div style="max-width:560px;margin:0 auto;background:#fffdf5;border:1px solid rgba(189,147,72,.28);border-radius:18px;padding:28px 28px 24px">
        <img src="${LOGO}" width="64" height="64" alt="HIVE" style="display:block;width:64px;height:64px;border:0;margin:0 0 12px">
        <p style="margin:0 0 4px;font-family:'Libre Baskerville',Georgia,serif;font-weight:700;font-size:18px;letter-spacing:.06em;color:#313130">HIVE</p>
        <p style="margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#bd9348">${esc(topic.subject)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${row('Name', esc(name))}
          ${row('Email', `<a href="mailto:${esc(email)}" style="color:#8a6a2f">${esc(email)}</a>`)}
          ${row('Topic', esc(topic.label))}
          ${row('Message', message ? `<span style="white-space:pre-wrap">${esc(message)}</span>` : '<span style="color:#8e7a5e">No message.</span>')}
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#8e7a5e">Reply to this email to reach them. Sent from the-hive.app.</p>
      </div>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: TO, cc: CC, reply_to: email, subject, text, html }),
    });
    if (!r.ok) {
      console.error('resend failed', r.status, await r.text());
      return res.status(502).json({ error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('resend threw', err);
    return res.status(502).json({ error: 'send_failed' });
  }
}

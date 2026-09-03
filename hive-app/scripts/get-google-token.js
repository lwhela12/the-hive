/**
 * Get a Google refresh token for the account the HIVE app schedules as.
 *
 * Usage — from `hive-app/`, one line, no secrets typed:
 *
 *     node scripts/get-google-token.js
 *
 * It reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET out of `.env`, prints a URL,
 * and waits. Open the URL, sign in as **the account that should OWN the HIVE's
 * meetings**, and approve.
 *
 * WHOSE ACCOUNT MATTERS MORE THAN ANYTHING ELSE HERE.
 * Every meeting the app creates is organized by whoever this token belongs to.
 * Until 2026-09-03 that was lucas@whelanpartners.com, so Nat — who runs every
 * HIVE — was only an invited GUEST on her own meetings: she could not edit
 * them, move them, or own the Meet room and its recording settings. Nat:
 * *"this is my baby, I'm doing all the work on it, so we need those to
 * function the same, that I can schedule something inside the app or from my
 * Google Cal and it's one and the same."*
 *
 * So the script now REFUSES a token it was not expecting. Pass the account you
 * mean and it checks with Google before writing anything:
 *
 *     node scripts/get-google-token.js --expect natwalstead@gmail.com
 *
 * THE TOKEN IS NEVER PRINTED. It is written to `.google-refresh-token` beside
 * this repo, mode 600, and the file is deleted the moment it is handed to
 * Supabase. The last one went into a chat transcript in plaintext because this
 * script used to `console.log` it, and rotating it has been an open job ever
 * since.
 *
 * Then, still from `hive-app/`:
 *
 *     npx supabase secrets set HIVE_GOOGLE_REFRESH_TOKEN="$(cat .google-refresh-token)"
 *     rm .google-refresh-token
 *
 * A token already in use keeps working when the scopes here change. Google
 * grants what was asked for at the moment of consent and nothing more, so
 * widening this list does nothing until somebody runs this again and approves
 * the new screen.
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.google-refresh-token');

/** Read a key out of `.env` so nobody has to paste a secret into a terminal. */
function fromEnvFile(key) {
  try {
    const file = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of file.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      if (trimmed.slice(0, at).trim() !== key) continue;
      return trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env — fall through to the environment */
  }
  return null;
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || fromEnvFile('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || fromEnvFile('GOOGLE_CLIENT_SECRET');

const expectAt = process.argv.indexOf('--expect');
const EXPECT = expectAt !== -1 ? (process.argv[expectAt + 1] || '').toLowerCase() : null;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ No GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — not in the environment, not in hive-app/.env.');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3000';
const SCOPES = [
  // Making and moving HIVE meetings on the calendar.
  'https://www.googleapis.com/auth/calendar.events',
  // Reading a Google Meet transcript back out of Drive, which is where Meet
  // leaves it — as a Doc in the meeting host's own Drive. Added 2026-08-19 for
  // `import-meet-transcripts`, when Tech HIVE moved its meetings to Meet.
  // Read-only on purpose: the app never writes to anybody's Drive.
  'https://www.googleapis.com/auth/drive.readonly',
  // Only so this script can say WHOSE account you just signed in as. Without
  // it the check below cannot run, and signing into the wrong account is the
  // exact mistake that made Nat a guest on her own meetings.
  'https://www.googleapis.com/auth/userinfo.email',
];

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // Force consent to get a refresh token

console.log('');
if (EXPECT) console.log(`Sign in as:  ${EXPECT}`);
console.log('\nOpen this URL in your browser:\n');
console.log(authUrl.toString());
console.log('\nWaiting...\n');

const page = (title, body) =>
  `<body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px">`
  + `<h1>${title}</h1><p>${body}</p></body>`;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname !== '/' || !parsedUrl.query.code) return;

  const done = (code, title, body) => {
    res.writeHead(code, { 'Content-Type': 'text/html' });
    res.end(page(title, body));
    setTimeout(() => { server.close(); process.exit(code === 200 ? 0 : 1); }, 500);
  };

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: parsedUrl.query.code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokens = await tokenResponse.json();

    if (!tokens.refresh_token) {
      console.error('❌ Google sent no refresh token. Try again — the consent screen has to be approved fresh.');
      return done(400, 'No token', 'Nothing was saved. Check the terminal.');
    }

    // WHOSE account is this? Asked before anything is written, because a token
    // for the wrong account looks identical to a token for the right one.
    let who = null;
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      who = (await me.json()).email ?? null;
    } catch {
      /* asked below */
    }

    if (EXPECT && who && who.toLowerCase() !== EXPECT) {
      console.error(`\n❌ That is ${who}, not ${EXPECT}. Nothing was saved.`);
      console.error('   Sign out of Google, or use a private window, and run this again.\n');
      return done(400, 'Wrong account', `Signed in as ${who}. Nothing was saved.`);
    }
    if (EXPECT && !who) {
      console.error('\n❌ Could not confirm which account that was, so nothing was saved.\n');
      return done(400, 'Could not confirm', 'Nothing was saved.');
    }

    // Never printed. Written where only this user can read it.
    fs.writeFileSync(OUT, tokens.refresh_token, { mode: 0o600 });

    console.log(`\n✅ Token saved for ${who ?? 'that account'}. It was not printed anywhere.`);
    console.log('\nNow, from hive-app/:\n');
    console.log('  npx supabase secrets set HIVE_GOOGLE_REFRESH_TOKEN="$(cat .google-refresh-token)"');
    console.log('  rm .google-refresh-token\n');
    return done(200, 'Done', `Signed in as ${who ?? 'that account'}. You can close this window.`);
  } catch (err) {
    console.error('❌ Could not exchange the code:', err);
    return done(500, 'Error', 'Check the terminal.');
  }
});

server.listen(3000, () => console.log('Listening on http://localhost:3000'));

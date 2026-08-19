/**
 * One-time script to get a Google refresh token for the HIVE account.
 *
 * Usage:
 * 1. Set your CLIENT_ID and CLIENT_SECRET below
 * 2. Run: node scripts/get-google-token.js
 * 3. Open the URL in your browser
 * 4. Sign in with the HIVE Google account — the one that OWNS the calendar
 *    events, because that is the account Google Meet saves a transcript to
 * 5. Copy the refresh token from the console output
 * 6. `npx supabase secrets set HIVE_GOOGLE_REFRESH_TOKEN=<the token>`
 *
 * A token already in use keeps working when the scopes here change. Google
 * grants what was asked for at the moment of consent and nothing more, so
 * widening this list does nothing at all until somebody runs the script again
 * and approves the new screen.
 */

const http = require('http');
const url = require('url');

// ⚠️ Set these as environment variables before running
// Example: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-token.js
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables');
  console.error('Usage: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-token.js');
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
];

// Build the auth URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

console.log('\n📋 Open this URL in your browser:\n');
console.log(authUrl.toString());
console.log('\n⏳ Waiting for callback...\n');

// Start local server to catch the callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/' && parsedUrl.query.code) {
    const code = parsedUrl.query.code;

    if (code) {
      try {
        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
          }),
        });

        const tokens = await tokenResponse.json();

        if (tokens.refresh_token) {
          console.log('✅ Success! Here\'s your refresh token:\n');
          console.log('─'.repeat(50));
          console.log(tokens.refresh_token);
          console.log('─'.repeat(50));
          console.log('\n📝 Save this as HIVE_GOOGLE_REFRESH_TOKEN in your Supabase secrets.\n');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Success!</h1><p>You can close this window. Check your terminal for the refresh token.</p>');
        } else {
          console.error('❌ No refresh token received:', tokens);
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>No refresh token received. Check terminal.</p>');
        }
      } catch (err) {
        console.error('❌ Error exchanging code:', err);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Error</h1><p>Failed to exchange code. Check terminal.</p>');
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Error</h1><p>No code in callback.</p>');
    }

    // Shut down after handling
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  }
});

server.listen(3000, () => {
  console.log('🖥️  Local server running on http://localhost:3000');
});

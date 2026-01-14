/**
 * One-time script to get a Google refresh token for Calendar API
 *
 * Usage:
 * 1. Set your CLIENT_ID and CLIENT_SECRET below
 * 2. Run: node scripts/get-google-token.js
 * 3. Open the URL in your browser
 * 4. Sign in with the Hive Gmail account
 * 5. Copy the refresh token from the console output
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
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

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

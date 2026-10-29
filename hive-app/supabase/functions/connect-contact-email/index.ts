import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const encoder = new TextEncoder();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function hashCode(userId: string, email: string, code: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    encoder.encode(`${userId}:${email}:${code}`)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equalHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// An already signed-in member verifies the contact address on their own
// profile. Admin updates the *same* Auth user ID after that proof, adding an
// email identity while keeping Google and all HIVE memberships. This does not
// need access to the old Gmail inbox or weaken secure email change globally.
serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return errorResponse('Sign in to HIVE first.', 401);
  let body: { action?: unknown; code?: unknown };
  try { body = await req.json(); } catch { return errorResponse('Invalid request.', 400); }
  if (body.action !== 'start' && body.action !== 'confirm') return errorResponse('Invalid request.', 400);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('FROM_EMAIL') ?? '';
  if (!url || !serviceKey || !resendKey || !from || from.includes('yourdomain.com')) {
    return errorResponse('Email verification is temporarily unavailable.', 503);
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return errorResponse('Sign in to HIVE first.', 401);

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('email').eq('id', user.id).maybeSingle();
  if (profileError || !profile) return errorResponse('Your HIVE profile could not be checked.', 503);
  const email = profile.email?.trim().toLowerCase() ?? '';
  if (!emailPattern.test(email)) return errorResponse('Ask Nat to correct the contact email on your profile first.', 409);

  if (body.action === 'start') {
    const { data: prior, error: priorError } = await admin.from('email_link_challenges')
      .select('last_sent_at').eq('user_id', user.id).maybeSingle();
    if (priorError) return errorResponse('Email verification is temporarily unavailable.', 503);
    if (prior && Date.now() - Date.parse(prior.last_sent_at) < 60_000) {
      return errorResponse('Please wait a minute before asking for another code.', 429);
    }

    const value = crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000;
    const code = value.toString().padStart(8, '0');
    const codeHash = await hashCode(user.id, email, code, serviceKey);
    const { error: saveError } = await admin.from('email_link_challenges').upsert({
      user_id: user.id, email, code_hash: codeHash, attempts: 0,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      last_sent_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (saveError) return errorResponse('Email verification is temporarily unavailable.', 503);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [email], subject: 'Connect this email to your HIVE account',
        text: `Enter ${code} in HIVE to connect this email to the account you are signed into. The code expires in 10 minutes. If you did not ask for this, ignore it.`,
        html: `<p>Enter <strong style="font-size:24px;letter-spacing:3px">${code}</strong> in HIVE to connect this email to the account you are signed into.</p><p>The code expires in 10 minutes. If you did not ask for this, ignore it.</p>`,
      }),
    });
    if (!response.ok) {
      console.error('Contact-email verification delivery was refused:', response.status);
      await admin.from('email_link_challenges').delete().eq('user_id', user.id);
      return errorResponse('HIVE could not send the code right now.', 503);
    }
    return jsonResponse({ sent: true, email });
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^\d{8}$/.test(code)) return errorResponse('Enter the eight-digit code from your email.', 400);
  const { data: challenge, error: challengeError } = await admin.from('email_link_challenges')
    .select('email, code_hash, attempts, expires_at').eq('user_id', user.id).maybeSingle();
  if (challengeError) return errorResponse('Email verification is temporarily unavailable.', 503);
  if (!challenge || challenge.email !== email || Date.parse(challenge.expires_at) <= Date.now()
    || challenge.attempts >= 5) return errorResponse('This code expired. Ask for a new one.', 400);

  await admin.from('email_link_challenges').update({ attempts: challenge.attempts + 1 })
    .eq('user_id', user.id);
  const submittedHash = await hashCode(user.id, email, code, serviceKey);
  if (!equalHash(submittedHash, challenge.code_hash)) return errorResponse('That code did not match.', 400);

  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email, email_confirm: true,
  });
  if (updateError || updated.user?.id !== user.id) {
    console.error('Could not connect verified contact email:', updateError);
    return errorResponse('This email could not be connected. Ask Nat for help.', 409);
  }
  await admin.from('email_link_challenges').delete().eq('user_id', user.id);
  return jsonResponse({ linked: true, email });
});

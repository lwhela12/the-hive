import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors, errorResponse } from '../_shared/cors.ts';

const encoder = new TextEncoder();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalidCode = () => errorResponse('That code did not work. Ask for a new one if needed.', 400);

async function hashContactCode(userId: string, email: string, code: string, secret: string): Promise<string> {
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

// One login door for every email provider. An existing member whose contact
// inbox differs from their old Google Auth email proves that inbox here. Only
// then does the server update the SAME Auth user and issue a session for it.
// A fresh invite or an already connected address uses Supabase's own OTP.
serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: { email?: unknown; code?: unknown };
  try { body = await req.json(); } catch { return invalidCode(); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!emailPattern.test(email) || email.length > 254 || !/^\d{8}$/.test(code)) return invalidCode();

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !serviceKey || !anonKey) return errorResponse('Email sign-in is temporarily unavailable.', 503);
  const authOptions = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  const admin = createClient(url, serviceKey, { auth: authOptions });
  const publicAuth = createClient(url, anonKey, { auth: authOptions });

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id').ilike('email', email).maybeSingle();
  if (profileError) return errorResponse('Email sign-in is temporarily unavailable.', 503);

  let contactRecovery = false;
  if (profile) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (error || !data.user) return errorResponse('Email sign-in is temporarily unavailable.', 503);
    contactRecovery = data.user.email?.trim().toLowerCase() !== email;
  }

  let session;
  if (contactRecovery && profile) {
    const { data: challenge, error: challengeError } = await admin.from('email_link_challenges')
      .select('email, code_hash, attempts, expires_at')
      .eq('user_id', profile.id).maybeSingle();
    if (challengeError) return errorResponse('Email sign-in is temporarily unavailable.', 503);
    if (!challenge || challenge.email !== email || challenge.attempts >= 5
      || Date.parse(challenge.expires_at) <= Date.now()) return invalidCode();

    // Count a guess atomically, including a correct one. Simultaneous requests
    // cannot overwrite the same attempt count and bypass the five-try limit.
    const { data: claimed, error: claimError } = await admin.from('email_link_challenges')
      .update({ attempts: challenge.attempts + 1 })
      .eq('user_id', profile.id).eq('email', email).eq('attempts', challenge.attempts)
      .gt('expires_at', new Date().toISOString())
      .select('user_id').maybeSingle();
    if (claimError) return errorResponse('Email sign-in is temporarily unavailable.', 503);
    if (!claimed) return invalidCode();
    const submitted = await hashContactCode(profile.id, email, code, serviceKey);
    if (!equalHash(submitted, challenge.code_hash)) return invalidCode();

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
      email, email_confirm: true,
    });
    if (updateError || updated.user?.id !== profile.id) {
      console.error('Could not attach a verified contact inbox:', updateError);
      return errorResponse('This email could not be connected. Ask Nat for help.', 409);
    }

    // Generate the Auth credential only after inbox proof, then exchange it
    // server-side. The browser receives only its new session, never a service
    // role key or an Auth credential for another member.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink', email,
    });
    if (linkError || !link?.properties?.hashed_token || link.user?.id !== profile.id) {
      console.error('Could not finish contact-email sign-in:', linkError);
      return errorResponse('Email connected, but sign-in did not finish. Ask for another code.', 503);
    }
    const verified = await publicAuth.auth.verifyOtp({
      token_hash: link.properties.hashed_token, type: 'email',
    });
    if (verified.error || verified.data.user?.id !== profile.id) {
      console.error('Could not exchange verified contact-email sign-in:', verified.error);
      return errorResponse('Email connected, but sign-in did not finish. Ask for another code.', 503);
    }
    session = verified.data.session;
    await admin.from('email_link_challenges').delete().eq('user_id', profile.id);
  } else {
    let verified = await publicAuth.auth.verifyOtp({ email, token: code, type: 'email' });
    if (verified.error) {
      verified = await publicAuth.auth.verifyOtp({ email, token: code, type: 'signup' });
    }
    if (verified.error || (profile && verified.data.user?.id !== profile.id)) return invalidCode();
    session = verified.data.session;
  }

  if (!session?.access_token || !session.refresh_token) return invalidCode();
  return new Response(JSON.stringify({
    access_token: session.access_token, refresh_token: session.refresh_token,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});

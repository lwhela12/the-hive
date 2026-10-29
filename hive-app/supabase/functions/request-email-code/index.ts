import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function opaqueEmailKey(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Supabase generates and verifies the actual OTP; HIVE delivers it through its
// existing verified Resend sender. The profile/invite checks happen first so
// generateLink cannot quietly create a second Auth ID for a member's contact
// email. The same code entry works inside an installed web app, with no OAuth
// trip out to another browser's storage.
serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: { email?: unknown; inviteToken?: unknown };
  try { body = await req.json(); } catch { return errorResponse('Enter an email address.', 400); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const inviteToken = typeof body.inviteToken === 'string' ? body.inviteToken.trim() : '';
  if (!emailPattern.test(email) || email.length > 254) return errorResponse('Enter a complete email address.', 400);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('FROM_EMAIL') ?? '';
  if (!url || !serviceKey || !resendKey || !from || from.includes('yourdomain.com')) {
    return errorResponse('Email sign-in is temporarily unavailable.', 503);
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id').ilike('email', email).maybeSingle();
  if (profileError) return errorResponse('Email sign-in is temporarily unavailable.', 503);

  let eligible = false;
  if (profile) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (error) return errorResponse('Email sign-in is temporarily unavailable.', 503);
    eligible = data.user?.email?.trim().toLowerCase() === email;
  } else if (/^[0-9a-f-]{36}$/i.test(inviteToken)) {
    const { data: invite, error } = await admin.from('community_invites')
      .select('email, accepted_at, expires_at').eq('token', inviteToken).maybeSingle();
    if (error) return errorResponse('Email sign-in is temporarily unavailable.', 503);
    eligible = !!invite && invite.email?.trim().toLowerCase() === email
      && !invite.accepted_at && (!invite.expires_at || Date.parse(invite.expires_at) > Date.now());
  }

  // Do not reveal which addresses belong to HIVE. The login screen also
  // explains that an existing Google member must connect another address
  // while signed in, rather than opening a new member ID here.
  if (!eligible) return jsonResponse({ sent: true });

  const emailHash = await opaqueEmailKey(email, serviceKey);
  const { data: reserved, error: rateError } = await admin.rpc('reserve_email_login_send', {
    p_email_hash: emailHash,
  });
  if (rateError) return errorResponse('Email sign-in is temporarily unavailable.', 503);
  if (!reserved) return errorResponse('Please wait before asking for another code.', 429);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink', email,
  });
  if (linkError || !link?.properties?.email_otp || (profile && link.user?.id !== profile.id)) {
    console.error('Could not generate an email sign-in code:', linkError);
    return errorResponse('Email sign-in is temporarily unavailable.', 503);
  }

  const code = link.properties.email_otp;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Your HIVE sign-in code',
      text: `Your HIVE sign-in code is ${code}. It expires soon. If you did not ask for it, you can ignore this email.`,
      html: `<p>Your HIVE sign-in code is <strong style="font-size:24px;letter-spacing:3px">${code}</strong>.</p><p>If you did not ask for it, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    console.error('Email sign-in delivery was refused:', response.status);
    return errorResponse('HIVE could not send a code right now. Try again later.', 503);
  }
  return jsonResponse({ sent: true });
});

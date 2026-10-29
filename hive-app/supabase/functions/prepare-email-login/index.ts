import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

// A new member can use an emailed code without a Google account, but only
// after arriving through an unexpired invite for that exact email. Ordinary
// sign-in uses shouldCreateUser:false, so trying a member's contact address
// before it is linked cannot create a second Auth user beside their profile.
serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let payload: { email?: unknown; token?: unknown };
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Open your HIVE invitation link and try again.', 400);
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const token = typeof payload.token === 'string' ? payload.token.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9a-f-]{36}$/i.test(token)) {
    return errorResponse('Open your HIVE invitation link and try again.', 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: invite, error: inviteError } = await admin
    .from('community_invites')
    .select('email, accepted_at, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (inviteError) {
    console.error('Could not check email-code invite:', inviteError);
    return errorResponse('HIVE could not check this invitation. Try again.', 503);
  }
  if (!invite || invite.email?.trim().toLowerCase() !== email
    || invite.accepted_at || (invite.expires_at && Date.parse(invite.expires_at) <= Date.now())) {
    return errorResponse('Open the current invitation link for this email.', 400);
  }

  // A profile can carry a preferred contact email different from its Google
  // Auth email. That member must link the preferred address while signed in;
  // provisioning a fresh Auth ID here would strand their existing HIVE data.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (profileError) {
    console.error('Could not check email-code profile:', profileError);
    return errorResponse('HIVE could not check this account. Try again.', 503);
  }
  if (profile) {
    return errorResponse('This email is already on a HIVE profile. Sign in to that profile first, then connect this email in Settings.', 409);
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (createError && !/already (been )?registered|already exists/i.test(createError.message)) {
    console.error('Could not prepare email-code account:', createError);
    return errorResponse('HIVE could not prepare this sign-in. Try again.', 503);
  }

  return jsonResponse({ ready: true });
});

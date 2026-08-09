import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/**
 * The hello half of the newsletter subscription — the unsubscribe half
 * (migration 123, site/api/unsubscribe.js) was built and tested; this
 * wasn't. Signing up on the public site called subscribe_to_newsletter and
 * went silent. Trello, 2026-08-06: "Subscriber welcome email — the
 * unsubscribe half is built and tested, the hello isn't."
 *
 * Called server-to-server from site/api/subscribe.js, after that function's
 * own call to the subscribe_to_newsletter RPC has already succeeded — never
 * called directly by a browser, so no user JWT to check. Public and
 * unauthenticated like transcribe/meeting-reminder (verify_jwt = false in
 * config.toml), but unlike a generic mailer this only ever sends ONE fixed
 * template: the only free text that reaches the email body is a first name,
 * escaped, dropped into a "Hi ___," — there is no field here that lets a
 * caller write arbitrary email content, so it can't become an open relay.
 *
 * Looks the subscriber's row back up by email (service role) rather than
 * trusting a token from the caller, so the unsubscribe link in this email
 * is real and specific to them — CAN-SPAM wants that on every commercial
 * email, not just the newsletter itself.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://the-hive.app';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(rawName: string | null): string {
  const trimmed = (rawName ?? '').trim();
  return trimmed.split(/\s+/)[0] || 'there';
}

function welcomeEmailHtml(rawName: string | null, unsubscribeUrl: string): string {
  const name = escapeHtml(firstName(rawName));
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
      <div style="text-align: center; padding: 8px 0 4px;">
        <span style="font-size: 40px;">🐝</span>
      </div>
      <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">You're on the list</h1>
      <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 20px;">The HIVE newsletter</p>
      <p style="font-size: 15px;">Hi ${name},</p>
      <p style="font-size: 15px;">Thanks for signing up. You'll hear from us every month or so — what the HIVE has been building, what's coming up, and the odd shout-out for someone who did something worth bragging about.</p>
      <p style="font-size: 15px;">Nothing to do on your end. If you want to see what's already gone out, the full archive is public:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${PUBLIC_SITE_URL}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Read past newsletters</a>
      </div>
      <p style="font-size: 12px; color: #9a9a9a; text-align: center;">Change your mind? <a href="${unsubscribeUrl}" style="color: #8a6a2f;">Unsubscribe any time</a>, one click, no questions asked.</p>
    </div>
  `;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  if (!RESEND_API_KEY) {
    return errorResponse('RESEND_API_KEY not configured', 500);
  }

  let body: { email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return errorResponse('Invalid email', 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Looked up rather than trusted from the request, so the unsubscribe link
  // always carries this subscriber's real token — never a guessable or
  // caller-supplied one.
  const { data: subscriber, error: lookupError } = await supabase
    .from('newsletter_subscribers')
    .select('name, token')
    .eq('email', email)
    .maybeSingle();

  if (lookupError || !subscriber) {
    // The subscribe RPC runs first and is the source of truth; if this
    // lookup ever misses, sending no email is the safe failure, not
    // guessing at a token.
    console.error('[subscribe-welcome] no subscriber row found for', email, lookupError);
    return errorResponse('Subscriber not found', 404);
  }

  const unsubscribeUrl = `${PUBLIC_SITE_URL}/api/unsubscribe?token=${encodeURIComponent(subscriber.token)}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "🐝 You're on the HIVE newsletter list",
      html: welcomeEmailHtml(subscriber.name ?? body.name ?? null, unsubscribeUrl),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[subscribe-welcome] Resend send failed', res.status, detail.slice(0, 300));
    return errorResponse(`Email send failed: ${detail}`, 502);
  }

  return jsonResponse({ sent: true });
});

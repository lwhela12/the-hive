import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const DEFAULT_INVITE_URL_BASE = 'https://app.the-hive.app/join';

function getInviteUrlBase() {
  const configuredBase = Deno.env.get('INVITE_URL_BASE')?.trim();
  const normalizedBase = (configuredBase || DEFAULT_INVITE_URL_BASE).replace(/\/+$/, '');

  if (
    normalizedBase === 'https://the-hive.app'
    || normalizedBase === 'https://www.the-hive.app'
    || normalizedBase === 'https://the-hive.app/join'
    || normalizedBase === 'https://www.the-hive.app/join'
    || normalizedBase === 'https://yourdomain.com/invite'
  ) {
    return DEFAULT_INVITE_URL_BASE;
  }

  return normalizedBase;
}

function normalizeHiveBrandName(name?: string | null) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'H.I.V.E.';
  const normalized = trimmed.toLowerCase();
  if (['hive', 'the hive', 'h.i.v.e.', 'the h.i.v.e.'].includes(normalized)) {
    return 'H.I.V.E.';
  }
  return trimmed;
}

interface InvitePayload {
  email: string;
  role?: 'member' | 'treasurer' | 'admin';
  community_id: string;
}

type PendingInvite = {
  id: string;
  token: string;
};

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Verify JWT manually (don't rely on gateway verification)
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  const auth = await verifySupabaseJwt(authHeader);

  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const { userId, token } = auth;

  // Create a Supabase client with the user's token
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' } } }
  );

  const payload: InvitePayload = await req.json();
  const email = payload.email?.trim().toLowerCase();
  const role = payload.role || 'member';
  const communityId = payload.community_id;

  if (!email || !communityId) {
    return errorResponse('Missing email or community_id', 400);
  }

  // Verify user is admin of this community
  const { data: adminMembership } = await supabaseClient
    .from('community_memberships')
    .select('id')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .single();

  if (!adminMembership) {
    return errorResponse('Admin access required', 403);
  }

  // Use service role for admin operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // 30 days, not 7. People get invited right before a holiday, or they mean to
  // do it on the weekend and don't — and a dead link is a terrible first
  // impression for a community whose whole thing is warmth (Nat 2026-07-25).
  // Re-sending refreshes the window, so this only sets how long someone can
  // dawdle before needing a nudge.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: community } = await supabaseAdmin
    .from('communities')
    .select('name')
    .eq('id', communityId)
    .single();

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, name')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMembership } = await supabaseAdmin
      .from('community_memberships')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', existingProfile.id)
      .maybeSingle();

    if (existingMembership) {
      const name = existingProfile.name || email;
      return errorResponse(`${name} is already a member of this HIVE. Use a different email to test new-member onboarding.`, 409);
    }
  }

  const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
    .from('community_invites')
    .select('id, token')
    .eq('community_id', communityId)
    .eq('email', email)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingInviteError) {
    console.error('Failed to check existing invite:', existingInviteError);
    return errorResponse('Failed to check existing invite', 500);
  }

  let token_invite = crypto.randomUUID();
  let reusedInvite = false;

  if (existingInvite) {
    const invite = existingInvite as PendingInvite;
    token_invite = invite.token;
    reusedInvite = true;

    const { error: updateInviteError } = await supabaseAdmin
      .from('community_invites')
      .update({
        role,
        invited_by: userId,
        expires_at: expiresAt,
      })
      .eq('id', invite.id);

    if (updateInviteError) {
      console.error('Failed to refresh invite:', updateInviteError);
      return errorResponse('Failed to refresh invite', 500);
    }
  } else {
    const { error: inviteError } = await supabaseAdmin
      .from('community_invites')
      .insert({
        community_id: communityId,
        email,
        role,
        invited_by: userId,
        token: token_invite,
        expires_at: expiresAt,
      });

    if (inviteError) {
      console.error('Failed to create invite:', inviteError);
      return errorResponse('Failed to create invite', 500);
    }
  }

  const inviteUrl = `${getInviteUrlBase()}?token=${encodeURIComponent(token_invite)}`;
  const communityName = normalizeHiveBrandName(community?.name);

  // "Nat invited you" lands better than "you have been invited" — an invitation
  // from a person, not from software.
  const { data: inviterProfile } = await supabaseAdmin
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  const inviterName = (inviterProfile?.name ?? '').trim().split(/\s+/)[0] || '';

  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: email,
          subject: `🍯 You're invited to the HIVE`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
              <div style="text-align: center; padding: 8px 0 4px;"><span style="font-size: 40px;">🐝</span></div>
              <h1 style="color: #bd9348; font-size: 22px; text-align: center; margin: 8px 0 4px;">Welcome to the HIVE</h1>
              <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 22px;">${inviterName ? `${inviterName} invited you` : "You've been invited"} to join ${communityName}</p>

              <p style="font-size: 15px;">The HIVE is a small group of people who help each other get things done. Everyone shares what they're working on and what they could use a hand with — and the rest of us go "oh, I can help with that." That's the whole idea.</p>

              <div style="text-align: center; margin: 26px 0;">
                <a href="${inviteUrl}" style="background: #bd9348; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Come on in</a>
              </div>

              <h2 style="color: #8a6b30; font-size: 15px; margin: 26px 0 8px;">Once you're in</h2>
              <p style="font-size: 15px; margin: 0 0 12px;">No rush, and nothing has to be perfect. Poke around — you can't break anything.</p>
              <ol style="font-size: 15px; padding-left: 20px; margin: 0;">
                <li style="margin-bottom: 8px;"><strong>Fill out your profile.</strong> A photo and a birthday go a long way — we like cake.</li>
                <li style="margin-bottom: 8px;"><strong>Add a few things you're good at.</strong> Anything counts: sourdough, spreadsheets, knowing a guy. This is how someone's wish finds its way to you.</li>
                <li style="margin-bottom: 8px;"><strong>Post one wish.</strong> Something you'd genuinely love help with. Start small — "I want someone to teach me three easy weeknight dinners" beats "I want to be healthier."</li>
                <li style="margin-bottom: 8px;"><strong>Have a wander.</strong> The boards are where we swap recommendations, plan hangs, and argue about movies.</li>
              </ol>

              <h2 style="color: #8a6b30; font-size: 15px; margin: 26px 0 8px;">Stuck? Ask Clive</h2>
              <p style="font-size: 15px; margin: 0 0 12px;">Clive is the HIVE's helper, and he lives in the app — tap the sparkles. He can explain how anything works, help you put a fuzzy wish into words, tell you what happened at a meeting you missed, or just chat. He's the fastest way to get unstuck, and he doesn't mind daft questions.</p>

              <p style="font-size: 15px;">And if all else fails, ${inviterName || 'whoever invited you'} is a text away. 💛</p>

              <p style="font-size: 13px; color: #9a9a9a; text-align: center; margin-top: 26px;">Your link works for the next 30 days. See you in there. 🍯</p>
              <p style="font-size: 12px; color: #c0c0c0; text-align: center; word-break: break-all;">${inviteUrl}</p>
            </div>
          `
        })
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
      // Don't fail the request if email fails - invite is still created
    }
  }

  return jsonResponse({ success: true, reusedInvite });
});

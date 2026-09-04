import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { hiveMark, hiveSealImg } from '../_shared/hiveMark.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const DEFAULT_INVITE_URL_BASE = 'https://app.the-hive.app/join';
/** Where the real logo is served from — the same file The Buzz already uses. */
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://the-hive.app';

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

  // 7 days (Nat 2026-07-26, reverting the 30 set on 07-25). A week is a nudge;
  // a month is a shelf. Re-sending refreshes the window and reuses the same
  // link, so an expired invite costs one tap in Admin, not a lost member.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: community } = await supabaseAdmin
    .from('communities')
    .select('name, accent_color, slug')
    .eq('id', communityId)
    .single();

  /**
   * The invite wears the HIVE's own colour.
   *
   * Nat, 2026-08-04: "I think we need to make 3 separate welcome emails, each
   * one colour coded to your HIVE." Three TEMPLATES would be three things to
   * keep in step and three places to forget a fix — so it is one letter that
   * reads `communities.accent_color`, which is the same field the rail, the
   * header and the tabs already use. A fourth HIVE gets its own colours on the
   * day it is created, with nobody writing an email.
   *
   * OG's gold is the fallback, so a HIVE with no colour set still looks like
   * the HIVE rather than like nothing.
   */
  const accent = (community?.accent_color as string | null) || '#bd9348';
  /** A wash of the accent, for the panel behind the "finding your way back" note. */
  const tint = (hex: string, alpha: number) => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return `rgba(189,147,72,${alpha})`;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${alpha})`;
  };
  /**
   * Deepened for text. Tech's #2f4a63 is fine as a button fill and too dark to
   * read as a heading on white — and Production's purple is the opposite — so
   * headings use the accent as-is and the button keeps white ink on top of it,
   * which works for all three.
   */
  const headingColour = accent;

  /**
   * The HIVE's display name is read HERE, above everything that says it out
   * loud, because Production's paragraph below needs it.
   *
   * It used to be declared further down, next to the invite link. That was
   * survivable while every HIVE shared one paragraph, and it broke the moment
   * Production got its own: a `const` cannot be read above the line that
   * creates it, so every Production invite threw before it reached the
   * database. Tech's and OG's kept working, because their paragraph never
   * mentions the name. Nat found it the same day, sending to a second address.
   */
  const communityName = normalizeHiveBrandName(community?.name);

  /**
   * What THIS HIVE is — the paragraph that comes after the universal one.
   *
   * Production HIVE isn't a community of individual goals like OG or Tech —
   * it's this HIVE's own singular project (Lucas, 2026-08-13, to Nat: "very
   * diff than the other HIVEs, its more of a 'project management' tool").
   * The "share what you're working on, others go 'I can help with that'"
   * paragraph describes OG/Tech's model and actively misdescribes
   * Production's, so each gets its own.
   *
   * Nat, 2026-08-14, reading a real Production invite: this used to REPLACE
   * the what-is-a-HIVE paragraph rather than follow it, so a Production
   * invitee was told how Production differs from the rest of the HIVEs before
   * anyone had told them what a HIVE is. Her order: what HIVE is, then what
   * Production HIVE is, then how it's different. The universal paragraph now
   * sits above this one and every HIVE gets both.
   */
  const isProductionHive = community?.slug === 'show';
  const whatIsThisHive = isProductionHive
    ? `<p style="font-size: 15px;">${communityName} works a little differently from the rest of the HIVEs. It isn't a group of people each working on their own thing — it's everyone rowing toward one shared goal: producing the show. Think of it as a project's home base — the to-dos, the plan, and the people making it happen, all in one place.</p>`
    : `<p style="font-size: 15px;">In ${communityName}, everyone shares what they're working on and what they could use a hand with — and the rest of us go "oh, I can help with that."</p>`;

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

  // "Nat invited you" lands better than "you have been invited" — an invitation
  // from a person, not from software.
  const { data: inviterProfile } = await supabaseAdmin
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  const inviterName = (inviterProfile?.name ?? '').trim().split(/\s+/)[0] || '';

  // "See you on the 19th" beats "see you at the next meeting" — a date is
  // something you can put in a calendar. Entirely optional: if the lookup
  // fails or nothing is scheduled, the line just reads without a date rather
  // than holding up the invite.
  let nextMeetingLabel = '';
  let nextMeetingDate = '';
  let nextMeetingWindow = '';
  let nextMeetingWhere = '';
  /** True only for a HIVE that has genuinely never met. */
  let hiveHasNeverMet = false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Whether the rhythm is still being worked out is not a matter of opinion:
    // a HIVE with meetings behind it has one, and a HIVE with none does not.
    const { count: pastMeetings } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .lt('event_date', today);
    hiveHasNeverMet = (pastMeetings ?? 0) === 0;
    const { data: nextMeeting } = await supabaseAdmin
      .from('events')
      .select('event_date, event_time, end_time, location, meet_link')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = nextMeeting as {
      event_date?: string;
      event_time?: string | null;
      end_time?: string | null;
      location?: string | null;
      meet_link?: string | null;
    } | null;
    const eventDate = row?.event_date;
    if (eventDate) {
      // Noon keeps the date from sliding a day backwards across time zones.
      nextMeetingDate = eventDate;
      nextMeetingLabel = new Date(`${eventDate}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });

      // Somebody deciding whether they can make it needs to know how long to
      // hold, not only when to turn up. Nat, 2026-08-21, putting the Tech HIVE
      // meeting in as 5-7: "i couldnt add window, like 5-7, i could only put in
      // 5pm." Meetings carry an `end_time` now (migration 202).
      const clock = (time?: string | null) => {
        if (!time) return '';
        const [h, m = '00'] = time.split(':');
        const hour = parseInt(h, 10);
        if (Number.isNaN(hour)) return '';
        return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      };
      const startText = clock(row?.event_time);
      const endText = clock(row?.end_time);
      if (startText && endText) {
        // "5:00 PM - 7:00 PM" is the same fact written twice.
        nextMeetingWindow = startText.slice(-2) === endText.slice(-2)
          ? `${startText.slice(0, -3)}\u2013${endText}`
          : `${startText}\u2013${endText}`;
      } else if (startText) {
        nextMeetingWindow = startText;
      }

      // Where it happens is part of "can I come?". A Meet HIVE says so rather
      // than quietly listing somebody's street address.
      nextMeetingWhere = row?.meet_link
        ? 'on Google Meet'
        : (row?.location ?? '').trim()
          ? `at ${(row?.location ?? '').trim()}`
          : '';
    }
  } catch (meetingLookupError) {
    console.error('Could not look up the next meeting for the invite email:', meetingLookupError);
  }

  /**
   * The meeting sentence.
   *
   * Nat, 2026-08-21, on whether to call the rhythm settled: *"i think that one
   * keeps bouncing around a lot... should we say that's always when it is or
   * just say that's when the first one will be?"* Her own answer, and the
   * right one — it is the plan, and the first meeting is where it gets
   * decided. A cadence announced before anybody has turned up is something to
   * walk back later.
   */
  /**
   * The rhythm, named rather than pointed at.
   *
   * This read "keeping it there every month", and Nat: *"instead it should
   * say 'we're thinking about keeping on the 1st thurs of the month...'
   * instead of 'there'."* "There" is only meaningful to somebody already
   * holding the date; the whole point of the sentence is telling a newcomer
   * what the pattern will be.
   *
   * Worked out from the meeting itself, so a HIVE that lands on the third
   * Tuesday says third Tuesday without anybody editing this.
   */
  const cadencePhrase = (() => {
    if (!nextMeetingDate) return '';
    const day = new Date(`${nextMeetingDate}T12:00:00`);
    const weekday = day.toLocaleDateString('en-US', { weekday: 'long' });
    const which = Math.ceil(day.getDate() / 7);
    // A fifth occurrence does not happen every month, so it is "last".
    const ordinal = ['first', 'second', 'third', 'fourth'][which - 1] ?? 'last';
    return `the ${ordinal} ${weekday} of every month`;
  })();

  const whenLine = `<strong>${nextMeetingLabel}${nextMeetingWindow ? `, ${nextMeetingWindow}` : ''}</strong>${nextMeetingWhere ? ` ${nextMeetingWhere}` : ''}`;
  const meetingSentence = !nextMeetingLabel
    ? `<p style="font-size: 15px;">We'll let you know when the next meeting lands. \u{1F41D}</p>`
    : hiveHasNeverMet
      ? [
          `<p style="font-size: 15px; margin: 0 0 6px;">First meeting is ${whenLine}. \u{1F41D}</p>`,
          `<p style="font-size: 14px; color: #6b6b6b; margin: 0;">We're thinking of keeping it on ${cadencePhrase || 'that day every month'}, same time. If a different day or time suits more people, we'll sort that out together at the first one.</p>`,
        ].join('\n              ')
      // An established HIVE already has its rhythm; offering to move it in a
      // welcome email would be someone else's decision to make.
      : `<p style="font-size: 15px;">See you at the next meeting, ${whenLine}. \u{1F41D}</p>`;

  // Send the email — and tell the truth about whether it went.
  //
  // Until 2026-08-11 this was a fire-and-forget fetch that never read Resend's
  // answer, so a refused send (unverified domain, dead key, bad FROM_EMAIL)
  // still came back to Admin as "Invite sent". That is exactly how Lucas's
  // Aug 4 invite to Tech HIVE vanished: the row was real, the email never
  // existed, and nobody was told. The invite row and its link are created
  // either way — an email failure never cancels the invitation — but the
  // response now says whether the email actually went, and the failure reason
  // lands in the function logs so the next session can read WHY.
  let emailSent = false;
  let emailError: string | null = null;

  if (!RESEND_API_KEY) {
    emailError = 'The RESEND_API_KEY secret is not set on this function, so HIVE cannot send invite emails at all.';
    console.error('Invite email not sent:', emailError);
  } else {
    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: email,
          subject: `🍯 You're invited to ${communityName}`,
          // Nat, 2026-08-11: the button was so high everyone would click it
          // before reading, and the app-walkthrough sections below it were
          // describing what the app itself should show you. ~60% fewer words,
          // the button moved to the BOTTOM so the reading comes first, the
          // "first thing you'll see" / "once you're in" / profile-checklist
          // sections deleted, and "meet you in person" dropped — not every
          // HIVE meets in person.
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.5;">
              <!-- The seal of the HIVE they were actually invited to (Nat,
                   2026-09-04). This was the one-logo-for-everybody until then,
                   which meant the first picture a new member ever saw of us
                   said nothing about the room they were joining — and the
                   headline right under it exists precisely to say which room
                   that is. Big, at 96px, because this is somebody's first
                   look; alt text because a good many people read mail with
                   images off. -->
              <div style="text-align: center; padding: 8px 0 4px;">
                ${hiveSealImg(hiveMark(community?.slug as string | null, accent), 96)}
              </div>
              <!-- The HIVE they were actually invited to is the headline.
                   Nat, 2026-08-21: "i'm leaning towards making Tech HIVE more
                   obvious here." It said "Welcome to the HIVE" in large type
                   with the real name in grey underneath it, so the one fact
                   the email exists to deliver was the quietest thing on it. -->
              <h1 style="color: ${headingColour}; font-size: 24px; text-align: center; margin: 8px 0 4px;">Welcome to ${communityName}</h1>
              <p style="text-align: center; color: #6b6b6b; font-size: 14px; margin: 0 0 22px;">${inviterName ? `${inviterName} invited you to join.` : "You've been invited to join."}</p>

              <p style="font-size: 15px;">We're so glad you're here.</p>

              <!-- What a HIVE is, before what THIS HIVE is. Nat's own words,
                   2026-08-14, borrowed from the newsletter's warmth. -->
              <p style="font-size: 15px;">The HIVE is a group of people with a shared interest, getting together and collectively working toward their goals.</p>

              <p style="font-size: 15px;">H.I.V.E. stands for <strong>Human, Insight, Vision, Execution</strong>. There are multiple HIVEs now, each with its own people and its own rhythm — and you've been invited to <strong>${communityName}</strong>.</p>

              ${whatIsThisHive}

              <p style="font-size: 15px;">Stuck on anything once you're in? Ask <strong>Clive</strong> — the HIVE's helper, behind the sparkles in the app. And ${inviterName || 'whoever invited you'} is a text away. 💛</p>

              <div style="background: ${tint(accent, 0.09)}; border: 1px solid ${tint(accent, 0.45)}; border-radius: 12px; padding: 14px 16px; margin: 22px 0;">
                <p style="font-size: 14px; margin: 0;"><strong>Finding your way back later:</strong> bookmark <a href="https://app.the-hive.app" style="color: ${headingColour};">app.the-hive.app</a>. No need to dig up this email again.</p>
              </div>

              ${meetingSentence}

              <div style="text-align: center; margin: 26px 0 8px;">
                <a href="${inviteUrl}" style="background: ${accent}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 15px; font-weight: 600; display: inline-block;">Come on in</a>
              </div>

              <!-- What happens AFTER the button, so nobody is surprised by the
                   tour and nobody who already knows a HIVE feels trapped in it
                   (Nat, 2026-08-14: "there's an onboarding wizard that will
                   show you around & if you're not new to how HIVE works, you
                   can skip it"). The tour itself shipped 2026-08-11 — five
                   real screens, and skipping writes tour_marks so it never
                   comes back on any device. -->
              <p style="font-size: 15px; margin-top: 4px;">Tap <strong>Come on in</strong> and you're through the door. A short tour meets you on the other side and walks you around the place — and if you already know your way around a HIVE, skip it and dive straight in.</p>

              <p style="font-size: 13px; color: #9a9a9a; text-align: center; margin-top: 18px;">Your link works for the next 7 days. 🍯</p>
              <p style="font-size: 12px; color: #c0c0c0; text-align: center; word-break: break-all;">${inviteUrl}</p>
            </div>
          `
        })
      });

      if (resendResponse.ok) {
        emailSent = true;
      } else {
        // The whole body goes to the logs — that is the observability this
        // function was missing. The response carries a shorter version for the
        // admin's screen.
        const responseBody = await resendResponse.text();
        console.error(`Resend refused the invite email (HTTP ${resendResponse.status}):`, responseBody);

        let resendSaid = '';
        try {
          const parsed = JSON.parse(responseBody) as { message?: string };
          if (parsed?.message) resendSaid = ` Resend said: ${parsed.message}`;
        } catch {
          // Not JSON — the raw body is already in the logs above.
        }
        emailError = `The email service refused the send (HTTP ${resendResponse.status}).${resendSaid}`;

        // The fallback FROM_EMAIL is a placeholder domain no email service will
        // accept, so when the secret is missing, say so — that alone explains
        // the refusal.
        if (!Deno.env.get('FROM_EMAIL')) {
          emailError += ' The FROM_EMAIL secret is not set, so the send used a placeholder address, which is enough on its own for the refusal.';
        }
      }
    } catch (emailSendError) {
      console.error('Failed to send invite email:', emailSendError);
      emailError = 'The request to the email service failed before it could answer.';
    }
  }

  // `inviteUrl` rides along so Admin can hand the link over by hand when the
  // email did not go — the link works whether or not any email was delivered.
  return jsonResponse({
    success: true,
    reusedInvite,
    inviteUrl,
    expiresAt,
    emailSent,
    emailError,
  });
});

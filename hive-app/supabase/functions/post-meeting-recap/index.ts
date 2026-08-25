import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import {
  eligibleRecapRecipients,
  postMeetingRecapHtml,
  postMeetingRecapSubject,
  recapPreviewBanner,
  type RecapMeeting,
  type RecapRecipient,
} from '../_shared/postMeetingRecap.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';
const APP_URL = Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app';
const PREVIEW_EMAIL = Deno.env.get('CHECK_IN_PREVIEW_EMAIL') || 'natwalstead@gmail.com';

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  email_reminders_enabled?: boolean | null;
  email_post_meeting_recap_enabled?: boolean | null;
};

type HeldMetadata = {
  post_meeting_recap_approval?: string;
  post_meeting_recap_meeting_id?: string;
  post_meeting_recap_community_id?: string;
  post_meeting_recap_absentee_ids?: string[];
  post_meeting_recap_sent_recipient_ids?: string[];
};

function asRecipient(profile: ProfileRow): RecapRecipient {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    emailRemindersEnabled: profile.email_reminders_enabled,
    emailPostMeetingRecapEnabled: profile.email_post_meeting_recap_enabled,
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!response.ok) throw new Error(`Email failed: ${await response.text()}`);
}

async function loadMeeting(admin: ReturnType<typeof createClient>, meetingId: string): Promise<RecapMeeting | null> {
  const { data } = await admin
    .from('meetings')
    .select('id, community_id, date, summary, community:communities!community_id(name)')
    .eq('id', meetingId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    community_id: string;
    date: string;
    summary?: string | null;
    community?: { name?: string | null } | null;
  };
  let title = `${row.community?.name || 'HIVE'} Meeting`;
  try {
    const parsed = JSON.parse(row.summary || '{}') as { title?: unknown };
    if (typeof parsed.title === 'string' && parsed.title.trim()) title = parsed.title.trim();
  } catch { /* old plain-text summaries use the fallback title */ }
  return {
    id: row.id,
    communityId: row.community_id,
    hiveName: row.community?.name || 'Your HIVE',
    title,
    date: row.date,
  };
}

async function loadCommunityProfiles(
  admin: ReturnType<typeof createClient>,
  communityId: string,
): Promise<RecapRecipient[]> {
  const { data, error } = await admin
    .from('community_memberships')
    .select('user_id, profile:profiles!user_id(id, name, email, email_reminders_enabled, email_post_meeting_recap_enabled)')
    .eq('community_id', communityId);
  if (error) throw error;
  return (data ?? [])
    .map((row: { profile?: ProfileRow | null }) => row.profile)
    .filter((profile: ProfileRow | null | undefined): profile is ProfileRow => !!profile)
    .map(asRecipient);
}

async function findPreviewProfile(admin: ReturnType<typeof createClient>) {
  const { data: byEmail } = await admin
    .from('profiles')
    .select('id, email')
    .ilike('email', PREVIEW_EMAIL)
    .maybeSingle();
  if (byEmail?.id) return { id: byEmail.id as string, email: PREVIEW_EMAIL };
  const { data: owners } = await admin.from('profiles').select('id').eq('is_owner', true).limit(1);
  const owner = owners?.[0] as { id?: string } | undefined;
  return owner?.id ? { id: owner.id, email: PREVIEW_EMAIL } : null;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByService = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* handled by validation below */ }

  const approveId = typeof body.approve_notification_id === 'string'
    ? body.approve_notification_id.trim()
    : '';

  try {
    if (approveId) {
      // Nat can approve from her signed-in owner session; Hermes can carry out
      // her explicit "go" through the trusted service path. Both routes are
      // separate from preview creation, and neither is available to members.
      if (!calledByService) {
        const auth = await verifySupabaseJwt(authHeader);
        if (isAuthError(auth) || !(await isOwner(admin, auth.userId))) {
          return errorResponse('That recap is not available for approval.', 403);
        }
      }

      const { data: heldRow } = await admin
        .from('notifications')
        .select('id, metadata')
        .eq('id', approveId)
        .maybeSingle();
      const metadata = (heldRow?.metadata ?? null) as HeldMetadata | null;
      if (!metadata || metadata.post_meeting_recap_approval !== 'pending') {
        return errorResponse('That recap is not waiting for approval.', 404);
      }

      const meetingId = metadata.post_meeting_recap_meeting_id ?? '';
      const communityId = metadata.post_meeting_recap_community_id ?? '';
      const confirmedIds = Array.isArray(metadata.post_meeting_recap_absentee_ids)
        ? metadata.post_meeting_recap_absentee_ids
        : [];
      const meeting = await loadMeeting(admin, meetingId);
      if (!meeting || meeting.communityId !== communityId) {
        return errorResponse('That held recap no longer matches a meeting.', 422);
      }

      // Re-read membership and both settings at approval time. A held preview is
      // never consent frozen in amber: leaving the HIVE or opting out wins.
      const alreadySent = new Set(metadata.post_meeting_recap_sent_recipient_ids ?? []);
      const recipients = eligibleRecapRecipients(
        confirmedIds,
        await loadCommunityProfiles(admin, communityId),
      ).filter((recipient) => !alreadySent.has(recipient.id));

      const { data: claimed } = await admin.from('notifications').update({
        metadata: { ...metadata, post_meeting_recap_approval: 'sending' },
      }).eq('id', approveId).eq('metadata->>post_meeting_recap_approval', 'pending').select('id').maybeSingle();
      if (!claimed) return errorResponse('That recap is already being approved.', 409);

      let sent = 0;
      const sentRecipientIds = [...alreadySent];
      const failures: string[] = [];
      for (const recipient of recipients) {
        try {
          await sendEmail(
            recipient.email!,
            postMeetingRecapSubject(meeting),
            postMeetingRecapHtml(recipient.name, meeting, APP_URL),
          );
          sent += 1;
          sentRecipientIds.push(recipient.id);
        } catch (error) {
          failures.push(`${recipient.id}: ${error instanceof Error ? error.message : 'send failed'}`);
        }
      }

      const settled = failures.length === 0;
      await admin.from('notifications').update({
        metadata: {
          ...metadata,
          post_meeting_recap_approval: settled ? 'approved' : 'pending',
          post_meeting_recap_approved_at: new Date().toISOString(),
          post_meeting_recap_sent_count: sent,
          post_meeting_recap_sent_recipient_ids: sentRecipientIds,
          post_meeting_recap_failures: failures,
        },
      }).eq('id', approveId);

      if (!settled) return errorResponse(`Sent ${sent}; ${failures.length} failed. Approval remains pending.`, 502);
      return jsonResponse({ approved: true, sent, opted_out_or_ineligible: confirmedIds.length - recipients.length });
    }

    // Two trusted paths create a hold. Seal Meeting no longer calls this
    // automatically as of 2026-08-24 — Nat: "I won't ever send a 'what you
    // missed' email that quickly... I'll read through the notes, make sure
    // they're correct, and THEN send." So this now runs only when an owner
    // deliberately triggers it from the meeting summary, after reviewing —
    // or, still, from a trusted service caller for anything scripted later.
    if (!calledByService) {
      const auth = await verifySupabaseJwt(authHeader);
      if (isAuthError(auth) || !(await isOwner(admin, auth.userId))) {
        return errorResponse('Recap previews can only be created by a HIVE owner.', 403);
      }
    }

    const meetingId = typeof body.meeting_id === 'string' ? body.meeting_id.trim() : '';
    const rawIds = Array.isArray(body.confirmed_absentee_ids) ? body.confirmed_absentee_ids : null;
    if (!meetingId || !rawIds || rawIds.some((id) => typeof id !== 'string')) {
      return errorResponse('meeting_id and confirmed_absentee_ids are required.', 400);
    }
    const requestedIds = [...new Set((rawIds as string[]).filter(Boolean))];
    if (requestedIds.length === 0) return jsonResponse({ held: false, reason: 'No confirmed absentees.' });

    const meeting = await loadMeeting(admin, meetingId);
    if (!meeting) return errorResponse('Meeting not found.', 404);

    // A pending hold from an earlier click (or a person added since) grows
    // rather than duplicates — one held preview per meeting, always reflecting
    // the current, reviewed notes. A hold that already finished sending gets
    // a fresh one instead of being reopened underneath people who were sent.
    const { data: existingRows } = await admin
      .from('notifications')
      .select('id, metadata')
      .eq('metadata->>post_meeting_recap_meeting_id', meeting.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const existingRow = existingRows?.[0] as { id: string; metadata: HeldMetadata } | undefined;
    const existingPending = existingRow?.metadata?.post_meeting_recap_approval === 'pending' ? existingRow : null;
    const confirmedIds = [...new Set([
      ...(existingPending?.metadata.post_meeting_recap_absentee_ids ?? []),
      ...requestedIds,
    ])];

    const recipients = eligibleRecapRecipients(
      confirmedIds,
      await loadCommunityProfiles(admin, meeting.communityId),
    );
    if (recipients.length === 0) {
      return jsonResponse({ held: false, reason: 'No confirmed absentees have recap email enabled.' });
    }

    const previewTo = await findPreviewProfile(admin);
    if (!previewTo) return errorResponse('No preview recipient is configured; nobody was emailed.', 503);

    // Preview one personalized example, but say exactly how many approved sends
    // it unlocks. Sent fresh every time this is triggered, on purpose — Nat
    // wants to see the actual current wording each time, not a stale copy.
    await sendEmail(
      previewTo.email,
      `[Waiting on you] ${postMeetingRecapSubject(meeting)}`,
      `${recapPreviewBanner(meeting, recipients.length)}${postMeetingRecapHtml(recipients[0].name, meeting, APP_URL)}`,
    );

    if (existingPending) {
      const { error } = await admin.from('notifications').update({
        content: `${recipients.length} confirmed ${recipients.length === 1 ? 'absentee gets' : 'absentees get'} the recap only after you approve the inbox preview.`,
        metadata: {
          ...existingPending.metadata,
          post_meeting_recap_absentee_ids: confirmedIds,
          post_meeting_recap_preview_recipient_count: recipients.length,
        },
      }).eq('id', existingPending.id);
      if (error) throw error;
      return jsonResponse({ held: true, refreshed: true, notificationId: existingPending.id, recipients: recipients.length });
    }

    const { data: notification, error } = await admin.from('notifications').insert({
      user_id: previewTo.id,
      community_id: meeting.communityId,
      notification_type: 'general',
      title: `✋ ${meeting.hiveName} “What you missed” is waiting on you`,
      content: `${recipients.length} confirmed ${recipients.length === 1 ? 'absentee gets' : 'absentees get'} the recap only after you approve the inbox preview.`,
      email_sent: true,
      metadata: {
        post_meeting_recap_approval: 'pending',
        post_meeting_recap_meeting_id: meeting.id,
        post_meeting_recap_community_id: meeting.communityId,
        post_meeting_recap_absentee_ids: confirmedIds,
        post_meeting_recap_preview_recipient_count: recipients.length,
      },
    }).select('id').single();
    if (error) throw error;
    return jsonResponse({ held: true, preview_sent: true, notificationId: notification.id, recipients: recipients.length });
  } catch (error) {
    console.error('[post-meeting-recap]', error);
    return errorResponse(error instanceof Error ? error.message : 'Post-meeting recap failed', 500);
  }
});

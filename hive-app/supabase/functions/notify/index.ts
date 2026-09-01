import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';

// Restored and locked down on 2026-08-03, after being deleted earlier the same day.
//
// Deleting the folder felt like the fix and wasn't. Removing source from the repo
// does not remove a function from Supabase: `notify` was still ACTIVE (version 16)
// on the live project after the delete, still answering anonymous POSTs, still
// emailing every member from our verified sending address. The open door was
// exactly as open as before — we'd just stopped being able to see it.
//
// It was worse than a no-op, because `supabase functions deploy` with no
// arguments deploys whatever it finds in this folder. While the folder existed,
// the very next routine deploy would have replaced the open version. Once it was
// gone, that command skipped `notify` forever and closing the hole depended on a
// human remembering a one-off `supabase functions delete notify` that nobody ran.
//
// So the file is back, with a door on it. Now either ending closes the hole: deploy
// and this locked version replaces the open one, or delete it from Supabase and
// it's gone for good. Nothing is left resting on somebody's memory.
//
// Nothing in the app calls this — checked the app code, the migrations, and the
// live database's scheduled jobs and triggers. It is kept because "email the HIVE"
// is a real tool worth having, not because something depends on it today.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'H.I.V.E. <hive@yourdomain.com>';

// The five kinds of message this can send. Anything else is refused rather than
// passed through to the database, which stores this as a fixed set of values.
const NOTIFICATION_TYPES = [
  'wish_match',
  'meeting_summary',
  'action_item',
  'general',
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

interface NotificationPayload {
  type: NotificationType;
  user_ids?: string[];
  community_id?: string;
  data: Record<string, unknown>;
}

// Whatever the caller wrote is text, never markup. The old version dropped the
// caller's words straight into the email body, so a single line of `contentText`
// could carry a link or a button and land in every member's inbox looking like
// the HIVE had sent it. That is how a sending domain gets reported and shut off,
// and it would take invites, check-ins and the newsletter down with it.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Plain-text version for the in-app notification, which renders as text already.
function asText(value: unknown): string {
  return String(value ?? '');
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  // The door, and it comes before anything is read, written or sent.
  //
  // Two ways in, the same shape check-in-reminder uses. The backend calls with the
  // service key, which nothing outside Supabase has. Nat and Lucas can call it
  // themselves. Everyone else gets the same flat refusal whether they never signed
  // in or signed in and aren't owners — a refusal shouldn't teach you what's behind
  // it, or suggest that trying again with a different account is worth the bother.
  //
  // Owner comes from profiles.is_owner (migration 128), never profiles.role: role
  // is writable by the person it describes, so authorising on it would let any
  // member promote themselves into this.
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByBackend = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  if (!calledByBackend) {
    const refusal = 'This one is not yours to send.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(supabaseAdmin, auth.userId))) return errorResponse(refusal, 403);
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { type, user_ids, community_id, data } = payload;

    if (!NOTIFICATION_TYPES.includes(type)) {
      return errorResponse('Unknown notification type', 400);
    }
    if (!data || typeof data !== 'object') {
      return errorResponse('Missing notification details', 400);
    }

    // Which HIVE this is going to has to be said out loud.
    //
    // The old version treated "no community named" as "everybody in every HIVE",
    // so the laziest possible request reached all three at once. Every HIVE has a
    // ceiling on how far its contents travel, and a message with no HIVE attached
    // can't respect one. Say which HIVE, or don't send.
    if (!community_id || typeof community_id !== 'string') {
      return errorResponse('Name the HIVE this is going to', 400);
    }

    const { data: memberRows, error: memberError } = await supabaseAdmin
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', community_id);

    if (memberError) {
      // A lookup that failed is not a lookup that said yes. Without a trustworthy
      // member list we have no idea who is entitled to this, so we send nothing.
      console.error('Could not read the member list:', memberError);
      return errorResponse('Could not check who is in this HIVE', 500);
    }

    const memberIds = new Set((memberRows ?? []).map((row: { user_id: string }) => row.user_id));

    // A named list narrows the send; it can never widen it past this HIVE. If a
    // caller names somebody who isn't in it, that's a mistake worth showing them
    // rather than quietly dropping, so they don't believe a message went out that
    // didn't.
    let recipientIds: string[];
    if (user_ids?.length) {
      const strangers = user_ids.filter((id) => !memberIds.has(id));
      if (strangers.length) {
        return errorResponse('Some of those people are not in this HIVE', 403);
      }
      recipientIds = user_ids;
    } else {
      recipientIds = [...memberIds];
    }

    if (!recipientIds.length) {
      return errorResponse('Nobody to notify', 400);
    }

    const { data: users, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email, preferred_contact')
      .in('id', recipientIds);

    if (usersError) {
      console.error('Could not read the recipients:', usersError);
      return errorResponse('Could not look up the recipients', 500);
    }
    if (!users?.length) {
      return errorResponse('Nobody to notify', 400);
    }

    // The wording is the same for everyone on the list, so it's built once rather
    // than rebuilt per person.
    let title = '';
    let content = '';
    let emailSubject = '';
    let emailBody = '';

    switch (type) {
      case 'wish_match': {
        const { wish, wisher } = data as { wish?: { description?: string }; wisher?: { name?: string } };
        title = 'Your skills might help!';
        content = `${asText(wisher?.name)} is wishing for: ${asText(wish?.description)}`;
        emailSubject = `Your skills might help ${asText(wisher?.name)}!`;
        emailBody = `
          <h2>A wish you might be able to grant</h2>
          <p><strong>${escapeHtml(wisher?.name)}</strong> is wishing for:</p>
          <blockquote>${escapeHtml(wish?.description)}</blockquote>
          <p>Think you can help? Open HIVE to connect.</p>
        `;
        break;
      }

      case 'meeting_summary': {
        const { meeting } = data as { meeting?: { date?: string; summary?: string } };
        title = 'Meeting Summary Available';
        content = `The summary for your meeting on ${asText(meeting?.date)} is ready.`;
        emailSubject = 'Meeting Summary Available';
        emailBody = `
          <h2>Meeting Summary - ${escapeHtml(meeting?.date)}</h2>
          <p>${escapeHtml(meeting?.summary)}</p>
          <p>Open HIVE to see action items and full details.</p>
        `;
        break;
      }

      case 'action_item': {
        const { description, dueDate } = data as { description?: string; dueDate?: string };
        title = 'New Action Item';
        content = asText(description);
        emailSubject = 'New Action Item Assigned';
        emailBody = `
          <h2>You've been assigned an action item</h2>
          <p>${escapeHtml(description)}</p>
          ${dueDate ? `<p><strong>Due:</strong> ${escapeHtml(dueDate)}</p>` : ''}
          <p>Open HIVE to mark it complete when done.</p>
        `;
        break;
      }

      case 'general': {
        const { titleText, contentText } = data as { titleText?: string; contentText?: string };
        title = asText(titleText);
        content = asText(contentText);
        emailSubject = asText(titleText);
        emailBody = `<p>${escapeHtml(contentText)}</p>`;
        break;
      }
    }

    // Every row is stamped with the HIVE we checked membership against. The old
    // version fell back to each person's own current HIVE, which meant the row
    // could land somewhere nobody had checked.
    const notifications = users.map((user: { id: string }) => ({
      user_id: user.id,
      community_id,
      notification_type: type,
      title,
      content,
      related_wish_id: (data as Record<string, unknown>).wish_id as string | undefined,
      related_meeting_id: (data as Record<string, unknown>).meeting_id as string | undefined,
      related_action_item_id: (data as Record<string, unknown>).action_item_id as string | undefined,
    }));

    // Keep the new rows' ids so the email flag below can find them again.
    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications)
      .select('id, user_id');

    if (insertError) {
      console.error('Could not save the notifications:', insertError);
      return errorResponse('Could not save the notifications', 500);
    }

    const newRowIdByUser = new Map<string, string>(
      (insertedRows ?? []).map((row: { id: string; user_id: string }) => [row.user_id, row.id])
    );

    const emailResults = await Promise.all(
      users
        /**
         * `preferred_contact` is gone (2026-09-01). It offered Email, Phone and
         * Text on the profile, and the app has never had a phone or a text
         * channel — so the six people who picked Text had quietly opted
         * themselves out of every email this function would ever send, and
         * nothing on screen said so. Nat: *"this 'preferred contact method' is
         * silly, because we dont have those options."*
         *
         * The column still exists and nothing reads it. Do not gate mail on it
         * again: the real per-kind email switches are the work that replaces
         * it, and a switch has to be one somebody set on purpose.
         */
        .filter((user: { email?: string }) => !!RESEND_API_KEY && !!user.email)
        .map((user: { id: string; email: string }) =>
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: user.email,
              subject: emailSubject,
              html: emailBody,
            }),
          })
            .then((res) => ({ userId: user.id, sent: res.ok }))
            .catch((error) => {
              console.error(`Email failed for ${user.email}:`, error);
              return { userId: user.id, sent: false };
            })
        )
    );

    // Mark the row we just made, by its id.
    //
    // This used to say "this person's notifications, newest first, limit 1", which
    // reads like it means one row but isn't a thing an update can do — the sort and
    // the limit were dropped and every notification that person had ever received
    // got stamped as emailed. Old unread ones then looked like mail had already
    // gone out about them.
    const emailedRowIds = emailResults
      .filter((result) => result.sent)
      .map((result) => newRowIdByUser.get(result.userId))
      .filter((id): id is string => !!id);

    if (emailedRowIds.length) {
      const { error: flagError } = await supabaseAdmin
        .from('notifications')
        .update({ email_sent: true })
        .in('id', emailedRowIds);
      if (flagError) {
        // The message did go out; only our record of it is off. Worth a log, not
        // worth telling the caller their send failed when it didn't.
        console.error('Could not mark those as emailed:', flagError);
      }
    }

    return jsonResponse({
      notifications_created: notifications.length,
      emails_sent: emailResults.filter((r) => r.sent).length,
    });
  } catch (error) {
    console.error('Notification error:', error);
    return errorResponse('Internal server error', 500);
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { sendReachEmail, deepLink } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';

interface NotifyDMPayload {
  room_id: string;
  sender_id: string;
  recipient_id: string;
  message_preview: string;
  /**
   * Sent by the app and deliberately ignored. Which HIVE a direct message
   * belongs to is a fact about the room, and the room is the thing we can
   * check. See the derivation below.
   */
  community_id?: string;
}

async function sendExpoPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: pushToken,
      title,
      body,
      sound: 'default',
      badge: 1,
      data: data || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Expo push failed: ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Verify the caller, the way the three notify-*-mention siblings always
    // have. This function ran with the service role and NEVER read the
    // Authorization header — the comment above said "no user auth needed",
    // which was true of the DATABASE client and not of the caller.
    //
    // An audit POSTed here with no Authorization header at all and reached the
    // database. Anyone could forge an in-app notification and an Expo push to
    // any member, titled with an impersonated member's real name — looked up
    // from the spoofed id, so it reads as genuine — carrying any text they
    // liked, stamped with any community.
    const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
    if (isAuthError(auth)) {
      return errorResponse(auth.error, auth.status);
    }

    const payload: NotifyDMPayload = await req.json();
    const { room_id, sender_id, recipient_id, message_preview } = payload;

    if (auth.userId !== sender_id) {
      return errorResponse('Authenticated user does not match sender', 403);
    }

    // Proving who is CALLING was only ever half of it. Until now, `recipient_id`
    // and `community_id` came out of the request body and were used as they
    // arrived — so any signed-in member could push an in-app notification and an
    // Expo push to any person in any HIVE, under their own real name, about a
    // conversation they were not part of. Being signed in is not the same as
    // being allowed.
    //
    // The room settles both questions at once. Two people who are both in a
    // direct-message room are two people who may notify each other, and the
    // room's own `community_id` is the HIVE the notification belongs to — which
    // matters more than it looks, because `notifications` is only readable when
    // the reader is a member of the HIVE stamped on it. A forged HIVE would have
    // produced a notification the recipient could never see.
    const { data: room, error: roomError } = await supabaseAdmin
      .from('chat_rooms')
      .select('id, community_id')
      .eq('id', room_id)
      .single();

    if (roomError || !room) {
      console.error('Failed to find the room:', roomError);
      return errorResponse('Room not found', 404);
    }

    const { data: roomMembers, error: roomMemberError } = await supabaseAdmin
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', room_id)
      .in('user_id', [sender_id, recipient_id]);

    if (roomMemberError) {
      console.error('Failed to verify room membership:', roomMemberError);
      return errorResponse('Could not verify the room', 500);
    }

    const inRoom = new Set((roomMembers ?? []).map((member: { user_id: string }) => member.user_id));
    if (!inRoom.has(sender_id) || !inRoom.has(recipient_id)) {
      return errorResponse('Sender or recipient is not in this room', 403);
    }

    const community_id: string = room.community_id;

    // Get sender profile for the notification title
    const { data: sender, error: senderError } = await supabaseAdmin
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', sender_id)
      .single();

    if (senderError || !sender) {
      console.error('Failed to get sender:', senderError);
      return errorResponse('Sender not found', 404);
    }

    // Get recipient profile to check push token
    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, push_token, preferred_contact, email')
      .eq('id', recipient_id)
      .single();

    if (recipientError || !recipient) {
      console.error('Failed to get recipient:', recipientError);
      return errorResponse('Recipient not found', 404);
    }

    const results: { push_sent: boolean; notification_created: boolean; email_sent: boolean } = {
      push_sent: false,
      notification_created: false,
      email_sent: false,
    };

    // Create in-app notification
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: recipient_id,
      community_id,
      notification_type: 'chat_dm',
      title: `New message from ${sender.name}`,
      content: message_preview.length > 100
        ? message_preview.substring(0, 100) + '...'
        : message_preview,
    });

    if (!notifError) {
      results.notification_created = true;
    } else {
      console.error('Failed to create notification:', notifError);
    }

    /**
     * One email per conversation, then quiet until they open it.
     *
     * Nat spotted this before it could bite: a back-and-forth of eleven lines
     * would otherwise be eleven emails for one conversation. So the rule is
     * exactly what a phone does — tell you once, go quiet, speak up again
     * after you have looked. `email_notified_at` is when we last wrote; they
     * have caught up when `last_read_at` has passed it.
     *
     * Boards deliberately do NOT work this way. A message thread nags until
     * you open it; a board post is one event and gets one email.
     */
    const { data: seat } = await supabaseAdmin
      .from('chat_room_members')
      .select('last_read_at, email_notified_at, muted')
      .eq('room_id', room_id)
      .eq('user_id', recipient_id)
      .maybeSingle();
    const seatRow = seat as { last_read_at?: string | null; email_notified_at?: string | null; muted?: boolean } | null;
    const told = seatRow?.email_notified_at ? Date.parse(seatRow.email_notified_at) : null;
    const seen = seatRow?.last_read_at ? Date.parse(seatRow.last_read_at) : null;
    // Never told about this one, or told and they have since caught up.
    const mayTellAgain = !told || (!!seen && seen >= told);

    if (mayTellAgain && !seatRow?.muted) {
      const { data: dmHive } = await supabaseAdmin
        .from('communities')
        .select('name, slug, accent_color')
        .eq('id', community_id)
        .maybeSingle();
      const hiveRow = dmHive as { name?: string; slug?: string; accent_color?: string } | null;
      const emailResult = await sendReachEmail(supabaseAdmin, recipient_id, 'message', {
        subject: `${hiveRow?.name ?? 'HIVE'} · ${sender.name} sent you a message`,
        hiveName: hiveRow?.name ?? 'Your HIVE',
        hiveSlug: hiveRow?.slug ?? null,
        hiveAccent: hiveRow?.accent_color ?? null,
        hiveId: community_id,
        heading: `${sender.name} sent you a message`,
        where: 'In your messages',
        said: message_preview,
        buttonLabel: 'Read it and reply',
        href: deepLink(`/messages?roomId=${encodeURIComponent(room_id)}`, community_id),
      });
      results.email_sent = emailResult.sent;
      // Stamped only when one actually went. Stamping on a refusal would make
      // the next message look like a duplicate and silence the conversation.
      if (emailResult.sent) {
        await supabaseAdmin
          .from('chat_room_members')
          .update({ email_notified_at: new Date().toISOString() })
          .eq('room_id', room_id)
          .eq('user_id', recipient_id);
      }
    }

    // Send push notification if recipient has a push token
    if (recipient.push_token) {
      try {
        await sendExpoPushNotification(
          recipient.push_token,
          sender.name,
          message_preview.length > 100
            ? message_preview.substring(0, 100) + '...'
            : message_preview,
          {
            type: 'chat_dm',
            room_id,
            sender_id,
          }
        );
        results.push_sent = true;
      } catch (pushError) {
        console.error('Push notification failed:', pushError);
      }
    }

    return jsonResponse(results);

  } catch (error) {
    console.error('Notify DM error:', error);
    return errorResponse('Internal server error', 500);
  }
});

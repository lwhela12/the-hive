import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';

interface NotifyBoardMentionPayload {
  post_id: string;
  sender_id: string;
  recipient_id: string;
  message_preview: string;
  community_id: string;
  board_name?: string;
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
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
    if (isAuthError(auth)) {
      return errorResponse(auth.error, auth.status);
    }

    const payload: NotifyBoardMentionPayload = await req.json();
    const { post_id, sender_id, recipient_id, message_preview, community_id, board_name } = payload;

    if (auth.userId !== sender_id) {
      return errorResponse('Authenticated user does not match sender', 403);
    }

    if (sender_id === recipient_id) {
      return jsonResponse({ skipped: true, reason: 'self_mention' });
    }

    const { data: post, error: postError } = await supabaseAdmin
      .from('board_posts')
      .select('id')
      .eq('id', post_id)
      .eq('community_id', community_id)
      .single();

    if (postError || !post) {
      console.error('Failed to verify board post:', postError);
      return errorResponse('Board post not found', 404);
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', community_id)
      .in('user_id', [sender_id, recipient_id]);

    if (membershipError) {
      console.error('Failed to verify memberships:', membershipError);
      return errorResponse('Could not verify memberships', 500);
    }

    const memberIds = new Set((memberships ?? []).map((membership: any) => membership.user_id));
    if (!memberIds.has(sender_id) || !memberIds.has(recipient_id)) {
      return errorResponse('Sender or recipient is not in this community', 403);
    }

    const { data: sender, error: senderError } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', sender_id)
      .single();

    if (senderError || !sender) {
      console.error('Failed to get sender:', senderError);
      return errorResponse('Sender not found', 404);
    }

    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from('profiles')
      .select('id, push_token')
      .eq('id', recipient_id)
      .single();

    if (recipientError || !recipient) {
      console.error('Failed to get recipient:', recipientError);
      return errorResponse('Recipient not found', 404);
    }

    const preview =
      message_preview.length > 100 ? message_preview.substring(0, 100) + '...' : message_preview;
    const boardLabel = board_name || 'a message board';
    const title = `${sender.name} mentioned you on ${boardLabel}`;

    const results: { push_sent: boolean; notification_created: boolean; duplicate_skipped?: boolean } = {
      push_sent: false,
      notification_created: false,
    };

    const notificationPayload = {
      user_id: recipient_id,
      community_id,
      notification_type: 'board_mention',
      title,
      content: preview,
      metadata: {
        post_id,
        sender_id,
        board_name: board_name ?? null,
      },
    };

    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentNotifications } = await supabaseAdmin
      .from('notifications')
      .select('id, metadata')
      .eq('user_id', recipient_id)
      .eq('community_id', community_id)
      .eq('notification_type', 'board_mention')
      .gte('created_at', since)
      .limit(10);

    const alreadyCreated = (recentNotifications ?? []).some((notification: any) =>
      notification?.metadata?.post_id === post_id &&
      notification?.metadata?.sender_id === sender_id
    );

    let notifError: any = null;
    if (alreadyCreated) {
      results.notification_created = true;
      results.duplicate_skipped = true;
    } else {
      const insertResult = await supabaseAdmin.from('notifications').insert(notificationPayload);
      notifError = insertResult.error;
    }

    if (notifError && String(notifError.message ?? '').includes('metadata')) {
      const { metadata: _metadata, ...legacyPayload } = notificationPayload;
      const retry = await supabaseAdmin.from('notifications').insert(legacyPayload);
      notifError = retry.error;
    }

    if (!notifError) {
      results.notification_created = true;
    } else {
      console.error('Failed to create notification:', notifError);
    }

    if (recipient.push_token) {
      try {
        await sendExpoPushNotification(recipient.push_token, title, preview, {
          type: 'board_mention',
          post_id,
          sender_id,
        });
        results.push_sent = true;
      } catch (pushError) {
        console.error('Push notification failed:', pushError);
      }
    }

    return jsonResponse(results);
  } catch (error) {
    console.error('Notify board mention error:', error);
    return errorResponse('Internal server error', 500);
  }
});

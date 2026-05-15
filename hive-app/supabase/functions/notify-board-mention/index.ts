import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

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
    const payload: NotifyBoardMentionPayload = await req.json();
    const { post_id, sender_id, recipient_id, message_preview, community_id, board_name } = payload;

    if (sender_id === recipient_id) {
      return jsonResponse({ skipped: true, reason: 'self_mention' });
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

    const results: { push_sent: boolean; notification_created: boolean } = {
      push_sent: false,
      notification_created: false,
    };

    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: recipient_id,
      community_id,
      notification_type: 'board_mention',
      title,
      content: preview,
    });

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

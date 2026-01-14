import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface NotifyDMPayload {
  room_id: string;
  sender_id: string;
  recipient_id: string;
  message_preview: string;
  community_id: string;
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

  // This function uses service_role - no user auth needed
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const payload: NotifyDMPayload = await req.json();
    const { room_id, sender_id, recipient_id, message_preview, community_id } = payload;

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

    const results: { push_sent: boolean; notification_created: boolean } = {
      push_sent: false,
      notification_created: false,
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

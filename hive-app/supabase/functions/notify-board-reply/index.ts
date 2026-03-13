import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface NotifyBoardReplyPayload {
  post_id: string;
  reply_author_id: string;
  reply_preview: string;
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
    const payload: NotifyBoardReplyPayload = await req.json();
    const { post_id, reply_author_id, reply_preview, community_id } = payload;

    // Look up the post to get the author's user_id
    const { data: post, error: postError } = await supabaseAdmin
      .from('board_posts')
      .select('author_id, title')
      .eq('id', post_id)
      .single();

    if (postError || !post) {
      console.error('Failed to get post:', postError);
      return errorResponse('Post not found', 404);
    }

    // Skip notification if the reply author is the post author
    if (reply_author_id === post.author_id) {
      return jsonResponse({ skipped: true, reason: 'self_reply' });
    }

    // Get reply author's name for the notification title
    const { data: replyAuthor, error: replyAuthorError } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', reply_author_id)
      .single();

    if (replyAuthorError || !replyAuthor) {
      console.error('Failed to get reply author:', replyAuthorError);
      return errorResponse('Reply author not found', 404);
    }

    // Get the post author's profile to check push token
    const { data: postAuthor, error: postAuthorError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, push_token')
      .eq('id', post.author_id)
      .single();

    if (postAuthorError || !postAuthor) {
      console.error('Failed to get post author:', postAuthorError);
      return errorResponse('Post author not found', 404);
    }

    const results: { push_sent: boolean; notification_created: boolean } = {
      push_sent: false,
      notification_created: false,
    };

    // Create in-app notification
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: post.author_id,
      community_id,
      notification_type: 'board_reply',
      title: `${replyAuthor.name} replied to your post`,
      content: reply_preview.length > 100
        ? reply_preview.substring(0, 100) + '...'
        : reply_preview,
    });

    if (!notifError) {
      results.notification_created = true;
    } else {
      console.error('Failed to create notification:', notifError);
    }

    // Send push notification if post author has a push token
    if (postAuthor.push_token) {
      try {
        await sendExpoPushNotification(
          postAuthor.push_token,
          `${replyAuthor.name} replied to your post`,
          reply_preview.length > 100
            ? reply_preview.substring(0, 100) + '...'
            : reply_preview,
          {
            type: 'board_reply',
            post_id,
          }
        );
        results.push_sent = true;
      } catch (pushError) {
        console.error('Push notification failed:', pushError);
      }
    }

    return jsonResponse(results);

  } catch (error) {
    console.error('Notify board reply error:', error);
    return errorResponse('Internal server error', 500);
  }
});

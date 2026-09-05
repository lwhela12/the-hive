import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { sendReachEmail, genericLetter, deepLink } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';

interface NotifyBoardReplyPayload {
  post_id: string;
  reply_author_id: string;
  reply_preview: string;
  /**
   * Sent by the app and deliberately ignored. Which HIVE a reply belongs to is
   * a fact about the post, and the post is the thing we can check. See the
   * derivation below.
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

    const payload: NotifyBoardReplyPayload = await req.json();
    const { post_id, reply_author_id, reply_preview } = payload;

    if (auth.userId !== reply_author_id) {
      return errorResponse('Authenticated user does not match the reply author', 403);
    }

    // Look up the post to get the author's user_id
    const { data: post, error: postError } = await supabaseAdmin
      .from('board_posts')
      .select('author_id, title, community_id')
      .eq('id', post_id)
      .single();

    if (postError || !post) {
      console.error('Failed to get post:', postError);
      return errorResponse('Post not found', 404);
    }

    // Proving who is CALLING was only ever half of it. Until now, `community_id`
    // came out of the request body and was used as it arrived, and nothing asked
    // whether this person could see the post at all — so any signed-in member
    // could push an in-app notification and an Expo push to any post author in
    // any HIVE, under their own real name. Being signed in is not the same as
    // being allowed.
    //
    // Asked with the CALLER'S OWN token, so the board's row-level security
    // answers the question instead of a hand-copied version of it. That keeps
    // HIVE-Wide boards working — a member of another HIVE may legitimately reply
    // there, and a plain "are you in this HIVE?" check would have refused them —
    // and it cannot drift out of step with the policy the way a copy would.
    const supabaseAsCaller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${auth.token}` } } }
    );

    const { data: visibleToCaller } = await supabaseAsCaller
      .from('board_posts')
      .select('id')
      .eq('id', post_id)
      .maybeSingle();

    if (!visibleToCaller) {
      return errorResponse('That post is not yours to reply to', 403);
    }

    // The HIVE is the post's, never the caller's word for it. `notifications` is
    // only readable by a member of the HIVE stamped on it, so a forged one would
    // have produced a notification the post author could never see.
    const community_id: string = post.community_id;

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

    const results: { push_sent: boolean; notification_created: boolean; email_sent: boolean } = {
      push_sent: false,
      notification_created: false,
      email_sent: false,
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

    /**
     * And the email, which is the one that actually arrives.
     *
     * The Expo push above reaches an installed app; HIVE is a browser tab, so
     * until there is an app to push to, this is the channel. Nat, 2026-09-01:
     * *"an email could be nice, because then people could know to go back into
     * the HIVE web app. And the usage has really fallen off."*
     *
     * A board post is one event and gets one email, however many replies it
     * gathers — the same shape as a comment thread anywhere. The
     * once-until-you-read rule belongs to messages, which nag.
     *
     * Sent AFTER the in-app row is written and never awaited into failure: a
     * letter that cannot go must not take the notification down with it.
     */
    const emailResult = await sendReachEmail(supabaseAdmin, post.author_id, 'boardReply', {
      ...genericLetter('boardReply', {
        buttonLabel: 'Read the reply',
        href: deepLink(`/board?postId=${encodeURIComponent(post_id)}`, community_id),
        hiveId: community_id,
      }),
    });

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

    results.email_sent = emailResult.sent;

    return jsonResponse(results);

  } catch (error) {
    console.error('Notify board reply error:', error);
    return errorResponse('Internal server error', 500);
  }
});

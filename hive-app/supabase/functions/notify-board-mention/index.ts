import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { sendReachEmail, sendReachEmails, deepLink } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError, isCommunityMember, isOwner } from '../_shared/auth.ts';

// One person by id, or a whole group resolved here. The sender may stand
// outside the HIVE they tagged — "@tech HIVE dont forget the check-in!" from
// OG's shout-out thread — and row-level security rightly hides that HIVE's
// member list from their client. Only this function, holding the service role
// and checking who is calling, can turn the group's name into its people
// (Nat's whole-HIVE mention idea, 2026-08-06; built 2026-08-12).
type MentionRecipientGroup =
  | { kind: 'hive'; community_id: string }
  | { kind: 'hive_wide' };

interface NotifyBoardMentionPayload {
  post_id: string;
  sender_id: string;
  /** One person. Exactly one of this and recipient_group must be given. */
  recipient_id?: string;
  /** A whole HIVE, or everyone HIVE-Wide. */
  recipient_group?: MentionRecipientGroup;
  message_preview: string;
  community_id: string;
  board_name?: string;
}

// How far a rung travels. Mirrors lib/scopeLook.ts: anything unrecognised
// reads as the rung that travels least, and 'members' is the events
// vocabulary for the same rung wishes call 'hive'.
const RUNG_RANK: Record<string, number> = { hive: 0, members: 0, all_hives: 1, public: 2 };

function rungOf(value: unknown): number {
  return RUNG_RANK[String(value ?? '')] ?? 0;
}

// The host HIVE's ceiling (communities.max_share_scope, migration 125) only
// ever narrows. Absent, the content's own reach stands on its own.
function travelsHiveWide(ownReach: unknown, ceiling: unknown): boolean {
  const own = rungOf(ownReach);
  const capped = ceiling == null ? own : Math.min(own, rungOf(ceiling));
  return capped >= RUNG_RANK.all_hives;
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
    const { post_id, sender_id, recipient_id, recipient_group, message_preview, community_id, board_name } = payload;

    if (auth.userId !== sender_id) {
      return errorResponse('Authenticated user does not match sender', 403);
    }

    if (recipient_id && recipient_group) {
      return errorResponse('Name one person or one group, not both', 400);
    }
    if (!recipient_id && !recipient_group) {
      return errorResponse('Say who this is for', 400);
    }

    const preview =
      message_preview.length > 100 ? message_preview.substring(0, 100) + '...' : message_preview;
    const boardLabel = board_name || 'a message board';

    // ----- A whole HIVE, or everyone HIVE-Wide, at once ----------------------
    if (recipient_group) {
      if (recipient_group.kind !== 'hive' && recipient_group.kind !== 'hive_wide') {
        return errorResponse('Unknown mention group', 400);
      }
      if (recipient_group.kind === 'hive' && !recipient_group.community_id) {
        return errorResponse('Which HIVE?', 400);
      }

      // The post is real, it lives where the caller says, and its board says
      // how far it travels.
      const { data: post, error: postError } = await supabaseAdmin
        .from('board_posts')
        .select('id, category_id')
        .eq('id', post_id)
        .eq('community_id', community_id)
        .single();

      if (postError || !post) {
        console.error('Failed to verify board post:', postError);
        return errorResponse('Board post not found', 404);
      }

      const { data: category } = await supabaseAdmin
        .from('board_categories')
        .select('reach')
        .eq('id', post.category_id)
        .maybeSingle();

      const { data: hostCommunity } = await supabaseAdmin
        .from('communities')
        .select('max_share_scope')
        .eq('id', community_id)
        .maybeSingle();

      const wide = travelsHiveWide(category?.reach, hostCommunity?.max_share_scope ?? null);

      // Who is asking. Owners (profiles.is_owner, migration 128 — never
      // profiles.role, which its own person can write) speak for every HIVE;
      // everyone else must at least belong to the HIVE the post lives in.
      const senderIsOwner = await isOwner(supabaseAdmin, sender_id);
      if (!senderIsOwner && !(await isCommunityMember(supabaseAdmin, sender_id, community_id))) {
        return errorResponse('Sender is not in this community', 403);
      }

      const targetCommunityId =
        recipient_group.kind === 'hive' ? recipient_group.community_id : null;
      const tagsBeyondHost = targetCommunityId !== community_id;

      // A tag cannot outrun what can be seen. People in another HIVE only get
      // told about a post they can actually open, which means the board must
      // travel HIVE-Wide and the host HIVE's ceiling must let it.
      if (tagsBeyondHost && !wide) {
        return errorResponse('This board does not travel HIVE-Wide', 403);
      }

      // You speak to your own people. A member may tag a HIVE they belong to;
      // owners may tag any HIVE (that is the whole point of the shout-out).
      if (targetCommunityId && tagsBeyondHost && !senderIsOwner) {
        if (!(await isCommunityMember(supabaseAdmin, sender_id, targetCommunityId))) {
          return errorResponse('You can only tag a HIVE you belong to', 403);
        }
      }

      let groupLabel = 'HIVE-Wide';
      if (targetCommunityId) {
        const { data: taggedHive } = await supabaseAdmin
          .from('communities')
          .select('name')
          .eq('id', targetCommunityId)
          .maybeSingle();
        if (!taggedHive) return errorResponse('That HIVE was not found', 404);
        groupLabel = taggedHive.name;
      }

      let membershipQuery = supabaseAdmin
        .from('community_memberships')
        .select('user_id, community_id');
      if (targetCommunityId) {
        membershipQuery = membershipQuery.eq('community_id', targetCommunityId);
      }
      const { data: membershipRows, error: membershipError } = await membershipQuery;

      if (membershipError) {
        // A lookup that failed is not a lookup that said yes.
        console.error('Failed to read the member list:', membershipError);
        return errorResponse('Could not read the member list', 500);
      }

      // One person, one notification. Someone in two HIVEs arrives on two
      // membership rows and leaves as one recipient, stamped with the post's
      // own HIVE when they belong to it (so the note surfaces where the post
      // lives), otherwise the first HIVE we saw them in. The sender never
      // hears about their own tag.
      const homeByUser = new Map<string, string>();
      for (const row of (membershipRows ?? []) as { user_id: string; community_id: string }[]) {
        if (row.user_id === sender_id) continue;
        const existing = homeByUser.get(row.user_id);
        if (!existing || row.community_id === community_id) {
          homeByUser.set(row.user_id, row.community_id);
        }
      }
      const recipientIds = [...homeByUser.keys()];

      if (recipientIds.length === 0) {
        return jsonResponse({ skipped: true, reason: 'nobody_to_notify' });
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

      const title = recipient_group.kind === 'hive_wide'
        ? `${sender.name} mentioned everyone HIVE-Wide on ${boardLabel}`
        : `${sender.name} mentioned everyone in ${groupLabel} on ${boardLabel}`;

      // The database trigger (migrations 095/158) may already have written the
      // in-app rows for the host HIVE's members when the post said an everyone
      // word. Same five-minute window, same metadata keys — the trigger stamps
      // `broadcast: true` too — so whichever writer got there first wins and
      // nobody reads the same tag twice. A personal "mentioned you" row does
      // NOT match this filter on purpose: being named by hand and being part
      // of a tagged HIVE are two different statements.
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentRows } = await supabaseAdmin
        .from('notifications')
        .select('user_id')
        .eq('notification_type', 'board_mention')
        .gte('created_at', since)
        .contains('metadata', { post_id, sender_id, broadcast: true })
        .in('user_id', recipientIds);

      const alreadyTold = new Set(
        ((recentRows ?? []) as { user_id: string }[]).map((row) => row.user_id)
      );

      const metadata = {
        post_id,
        sender_id,
        board_name: board_name ?? null,
        broadcast: true,
        group: recipient_group.kind,
        group_community_id: targetCommunityId,
      };

      const rows = recipientIds
        .filter((userId) => !alreadyTold.has(userId))
        .map((userId) => ({
          user_id: userId,
          community_id: homeByUser.get(userId),
          notification_type: 'board_mention',
          title,
          content: preview,
          metadata,
        }));

      let notificationsCreated = 0;
      if (rows.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('notifications').insert(rows);
        if (insertError) {
          console.error('Failed to create notifications:', insertError);
        } else {
          notificationsCreated = rows.length;
        }
      }

      /**
       * The email, to the people this is genuinely new for.
       *
       * `alreadyTold` is reused rather than recomputed: somebody who already
       * has a row for this exact post from this exact sender has already been
       * written to, and a second letter about one sentence is the fastest way
       * to teach a person to ignore both.
       */
      const { data: mentionHive } = await supabaseAdmin
        .from('communities')
        .select('name, slug, accent_color')
        .eq('id', targetCommunityId)
        .maybeSingle();
      const groupHive = mentionHive as { name?: string; slug?: string; accent_color?: string } | null;
      const emailsSent = await sendReachEmails(
        supabaseAdmin,
        recipientIds.filter((userId) => !alreadyTold.has(userId)),
        'mention',
        {
          subject: `${groupHive?.name ?? 'HIVE'} · ${title}`,
          hiveName: groupHive?.name ?? 'Your HIVE',
          hiveSlug: groupHive?.slug ?? null,
          hiveAccent: groupHive?.accent_color ?? null,
          heading: title,
          where: board_name ? String(board_name) : 'On the boards',
          said: preview,
          buttonLabel: 'Go and see',
          href: deepLink(`/board?postId=${encodeURIComponent(post_id)}`, targetCommunityId),
        },
      );

      // Pushes go to everyone in the group, even where the row already existed
      // — the trigger writes rows and never pushes, so the push is this
      // function's job alone. Mirrors the per-person path, which also pushes
      // when it skips a duplicate row.
      const { data: recipients } = await supabaseAdmin
        .from('profiles')
        .select('id, push_token')
        .in('id', recipientIds)
        .not('push_token', 'is', null);

      const pushResults = await Promise.all(
        ((recipients ?? []) as { id: string; push_token?: string }[])
          .filter((recipient) => !!recipient.push_token)
          .map((recipient) =>
            sendExpoPushNotification(recipient.push_token as string, title, preview, {
              type: 'board_mention',
              post_id,
              sender_id,
            })
              .then(() => true)
              .catch((pushError) => {
                console.error('Push notification failed:', pushError);
                return false;
              })
          )
      );

      return jsonResponse({
        emails_sent: emailsSent,
        group: recipient_group.kind,
        recipients: recipientIds.length,
        notifications_created: notificationsCreated,
        pushes_sent: pushResults.filter(Boolean).length,
      });
    }

    // ----- One person, by id (the path that has always existed) --------------
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

    const title = `${sender.name} mentioned you on ${boardLabel}`;

    const results: { push_sent: boolean; notification_created: boolean; duplicate_skipped?: boolean; email_sent?: boolean } = {
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

    // The email. Skipped for a duplicate, on the same reasoning as the group
    // path: the row already existed, so the letter already went.
    if (!results.duplicate_skipped) {
      const { data: soloHive } = await supabaseAdmin
        .from('communities')
        .select('name, slug, accent_color')
        .eq('id', community_id)
        .maybeSingle();
      const hiveRow = soloHive as { name?: string; slug?: string; accent_color?: string } | null;
      const emailResult = await sendReachEmail(supabaseAdmin, recipient_id, 'mention', {
        subject: `${hiveRow?.name ?? 'HIVE'} · ${title}`,
        hiveName: hiveRow?.name ?? 'Your HIVE',
        hiveSlug: hiveRow?.slug ?? null,
        hiveAccent: hiveRow?.accent_color ?? null,
        heading: title,
        where: board_name ? String(board_name) : 'On the boards',
        said: preview,
        buttonLabel: 'Go and see',
        href: deepLink(`/board?postId=${encodeURIComponent(post_id)}`, community_id),
      });
      (results as { email_sent?: boolean }).email_sent = emailResult.sent;
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

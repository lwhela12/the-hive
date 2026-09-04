import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { sendReachEmail, sendReachEmails, deepLink } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError, isCommunityMember, isOwner } from '../_shared/auth.ts';

// One person by id, or a whole group resolved here. The sender may stand
// outside the HIVE they tagged, and row-level security rightly hides that
// HIVE's member list from their client. Only this function, holding the
// service role and checking who is calling, can turn the group's name into
// its people (Nat's whole-HIVE mention idea, 2026-08-06; built 2026-08-12).
type MentionRecipientGroup =
  | { kind: 'hive'; community_id: string }
  | { kind: 'hive_wide' };

interface NotifyWishMentionPayload {
  wish_id: string;
  sender_id: string;
  /** One person. Exactly one of this and recipient_group must be given. */
  recipient_id?: string;
  /** A whole HIVE, or everyone HIVE-Wide. */
  recipient_group?: MentionRecipientGroup;
  message_preview: string;
  community_id: string;
  wish_owner_name?: string;
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

    const payload: NotifyWishMentionPayload = await req.json();
    const { wish_id, sender_id, recipient_id, recipient_group, message_preview, community_id, wish_owner_name } = payload;

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
    const wishLabel = wish_owner_name ? `${wish_owner_name}'s wish` : 'a wish';

    // ----- A whole HIVE, or everyone HIVE-Wide, at once ----------------------
    if (recipient_group) {
      if (recipient_group.kind !== 'hive' && recipient_group.kind !== 'hive_wide') {
        return errorResponse('Unknown mention group', 400);
      }
      if (recipient_group.kind === 'hive' && !recipient_group.community_id) {
        return errorResponse('Which HIVE?', 400);
      }

      // The wish is real, it lives where the caller says, and its share scope
      // says how far it travels.
      const { data: wish, error: wishError } = await supabaseAdmin
        .from('wishes')
        .select('id, share_scope')
        .eq('id', wish_id)
        .eq('community_id', community_id)
        .is('deleted_at', null)
        .single();

      if (wishError || !wish) {
        console.error('Failed to verify wish:', wishError);
        return errorResponse('Wish not found', 404);
      }

      const { data: hostCommunity } = await supabaseAdmin
        .from('communities')
        .select('max_share_scope')
        .eq('id', community_id)
        .maybeSingle();

      const wide = travelsHiveWide(wish.share_scope, hostCommunity?.max_share_scope ?? null);

      // Who is asking. Owners (profiles.is_owner, migration 128) speak for
      // every HIVE; everyone else must at least belong to the wish's HIVE.
      const senderIsOwner = await isOwner(supabaseAdmin, sender_id);
      if (!senderIsOwner && !(await isCommunityMember(supabaseAdmin, sender_id, community_id))) {
        return errorResponse('Sender is not in this community', 403);
      }

      const targetCommunityId =
        recipient_group.kind === 'hive' ? recipient_group.community_id : null;
      const tagsBeyondHost = targetCommunityId !== community_id;

      // A tag cannot outrun what can be seen. People in another HIVE only get
      // told about a wish they can actually open, which means the wish must
      // travel HIVE-Wide and the host HIVE's ceiling must let it.
      if (tagsBeyondHost && !wide) {
        return errorResponse('This wish does not travel HIVE-Wide', 403);
      }

      // You speak to your own people. A member may tag a HIVE they belong to;
      // owners may tag any HIVE.
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
      // membership rows and leaves as one recipient, stamped with the wish's
      // own HIVE when they belong to it, otherwise the first HIVE we saw them
      // in. The sender never hears about their own tag.
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
        ? `${sender.name} mentioned everyone HIVE-Wide on ${wishLabel}`
        : `${sender.name} mentioned everyone in ${groupLabel} on ${wishLabel}`;

      // No database trigger backs wish mentions up, so this window guards
      // against the same tag being fanned out twice — a double-fired send, or
      // a named HIVE arriving in two comments moments apart. Keyed on the wish
      // and the sender, the same coarse way the board path keys on its post.
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentRows } = await supabaseAdmin
        .from('notifications')
        .select('user_id')
        .eq('notification_type', 'wish_mention')
        .gte('created_at', since)
        .contains('metadata', { wish_id, sender_id, broadcast: true })
        .in('user_id', recipientIds);

      const alreadyTold = new Set(
        ((recentRows ?? []) as { user_id: string }[]).map((row) => row.user_id)
      );

      const metadata = {
        wish_id,
        sender_id,
        wish_owner_name: wish_owner_name ?? null,
        broadcast: true,
        group: recipient_group.kind,
        group_community_id: targetCommunityId,
      };

      const rows = recipientIds
        .filter((userId) => !alreadyTold.has(userId))
        .map((userId) => ({
          user_id: userId,
          community_id: homeByUser.get(userId),
          notification_type: 'wish_mention',
          title,
          content: preview,
          related_wish_id: wish_id,
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

      // Emails to exactly the people whose row was just written, for the same
      // reason the pushes below are: somebody inside the dedupe window has
      // already heard about this one.
      const freshRecipients = recipientIds.filter((userId) => !alreadyTold.has(userId));
      const { data: wishHive } = await supabaseAdmin
        .from('communities')
        .select('name, slug, accent_color')
        .eq('id', targetCommunityId)
        .maybeSingle();
      const groupHive = wishHive as { name?: string; slug?: string; accent_color?: string } | null;
      const emailsSent = await sendReachEmails(supabaseAdmin, freshRecipients, 'mention', {
        subject: `${groupHive?.name ?? 'HIVE'} · ${title}`,
        hiveName: groupHive?.name ?? 'Your HIVE',
        hiveSlug: groupHive?.slug ?? null,
        hiveAccent: groupHive?.accent_color ?? null,
        hiveId: targetCommunityId,
        heading: title,
        where: wish_owner_name ? `${wish_owner_name}'s HD wish` : 'On a wish',
        said: preview,
        buttonLabel: 'Go and see',
        href: deepLink('/hive', targetCommunityId),
      });

      // Pushes only for the people whose row was just written — a recipient in
      // the dedupe window was already pushed by whichever call wrote their row.
      const pushTargets = freshRecipients;
      let pushesSent = 0;
      if (pushTargets.length > 0) {
        const { data: recipients } = await supabaseAdmin
          .from('profiles')
          .select('id, push_token')
          .in('id', pushTargets)
          .not('push_token', 'is', null);

        const pushResults = await Promise.all(
          ((recipients ?? []) as { id: string; push_token?: string }[])
            .filter((recipient) => !!recipient.push_token)
            .map((recipient) =>
              sendExpoPushNotification(recipient.push_token as string, title, preview, {
                type: 'wish_mention',
                wish_id,
                sender_id,
              })
                .then(() => true)
                .catch((pushError) => {
                  console.error('Push notification failed:', pushError);
                  return false;
                })
            )
        );
        pushesSent = pushResults.filter(Boolean).length;
      }

      return jsonResponse({
        group: recipient_group.kind,
        recipients: recipientIds.length,
        notifications_created: notificationsCreated,
        pushes_sent: pushesSent,
        emails_sent: emailsSent,
      });
    }

    // ----- One person, by id (the path that has always existed) --------------
    if (sender_id === recipient_id) {
      return jsonResponse({ skipped: true, reason: 'self_mention' });
    }

    const { data: wish, error: wishError } = await supabaseAdmin
      .from('wishes')
      .select('id')
      .eq('id', wish_id)
      .eq('community_id', community_id)
      .is('deleted_at', null)
      .single();

    if (wishError || !wish) {
      console.error('Failed to verify wish:', wishError);
      return errorResponse('Wish not found', 404);
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

    const title = `${sender.name} mentioned you on ${wishLabel}`;

    const results: { push_sent: boolean; notification_created: boolean; email_sent?: boolean } = {
      push_sent: false,
      notification_created: false,
    };

    const notificationPayload = {
      user_id: recipient_id,
      community_id,
      notification_type: 'wish_mention',
      title,
      content: preview,
      related_wish_id: wish_id,
      metadata: {
        wish_id,
        sender_id,
        wish_owner_name: wish_owner_name ?? null,
      },
    };

    let { error: notifError } = await supabaseAdmin.from('notifications').insert(notificationPayload);
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

    {
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
        hiveId: community_id,
        heading: title,
        where: wish_owner_name ? `${wish_owner_name}'s HD wish` : 'On a wish',
        said: preview,
        buttonLabel: 'Go and see',
        href: deepLink('/hive', community_id),
      });
      results.email_sent = emailResult.sent;
    }

    if (recipient.push_token) {
      try {
        await sendExpoPushNotification(recipient.push_token, title, preview, {
          type: 'wish_mention',
          wish_id,
          sender_id,
        });
        results.push_sent = true;
      } catch (pushError) {
        console.error('Push notification failed:', pushError);
      }
    }

    return jsonResponse(results);
  } catch (error) {
    console.error('Notify wish mention error:', error);
    return errorResponse('Internal server error', 500);
  }
});

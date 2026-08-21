import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';

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

/**
 * 'HH:MM:SS' -> '5:30 PM'. Only reached when a meeting has an end time (see
 * below) — a meeting with none keeps the raw `event_time` string it always
 * sent, so this stays byte-identical for every meeting that hasn't been
 * given a window yet.
 */
function formatClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const [rawH, rawM] = value.split(':');
  const h = Number(rawH);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${rawM ?? '00'} ${suffix}`;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  // The comment that used to sit here said "uses service_role - no user auth
  // needed", which is word for word what sat on notify-dm until yesterday, and
  // meant the same wrong thing there: the DATABASE client needs no user, so
  // nobody ever asked who the CALLER was.
  //
  // Anyone who knew the address could POST an empty body and fire tomorrow's
  // reminder — an in-app notification plus a push to every member of every HIVE
  // with a meeting tomorrow. The dedup check in the loop is the only reason it
  // is not also a way to buzz everybody's phone on repeat, and dedup is a
  // convenience, not a lock: change the meeting title and it fires again.
  //
  // Same door as check-in-reminder, for the same reasons: the nightly job comes
  // in with the service key, Nat and Lucas can still fire it by hand, and
  // everybody else gets the same flat answer whether they never signed in or
  // signed in and are not an owner. A refusal shouldn't teach you what is
  // behind it.
  //
  // WORTH KNOWING: nothing calls this today. There is no pg_cron entry for it
  // (only check-in-reminder-daily and seal-meeting-nightly exist) and no client
  // code invokes it — the sample schedule is still commented out in
  // supabase/config.toml. So this closes a door on an empty room. When that
  // cron finally gets written, it has to carry the SERVICE key, not the anon
  // key, or it will be refused quietly with nobody to complain to — which is
  // exactly the mistake migration 132 had to go back and fix.
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByCron = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  if (!calledByCron) {
    const refusal = 'The meeting reminder runs on its own schedule.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(supabaseAdmin, auth.userId))) return errorResponse(refusal, 403);
  }

  try {
    // Calculate tomorrow's date in UTC
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    console.log(`Checking for meetings on ${tomorrowStr}`);

    // Query events table for meetings happening tomorrow
    const { data: meetingEvents, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('event_date', tomorrowStr)
      .eq('event_type', 'meeting');

    if (eventsError) {
      console.error('Error fetching meeting events:', eventsError);
      return errorResponse('Failed to fetch meeting events', 500);
    }

    if (!meetingEvents || meetingEvents.length === 0) {
      console.log('No meetings scheduled for tomorrow');
      return jsonResponse({ message: 'No meetings scheduled for tomorrow', reminders_sent: 0 });
    }

    console.log(`Found ${meetingEvents.length} meeting(s) for tomorrow`);

    let totalPushSent = 0;
    let totalNotificationsCreated = 0;
    let totalSkippedDuplicate = 0;

    for (const event of meetingEvents) {
      // Get all community members for this event's community
      const { data: memberships, error: memberError } = await supabaseAdmin
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', event.community_id);

      if (memberError || !memberships?.length) {
        console.error(`Error fetching members for community ${event.community_id}:`, memberError);
        continue;
      }

      const memberIds = memberships.map((m: { user_id: string }) => m.user_id);

      // Get profiles with push tokens for these members
      const { data: members, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, name, push_token')
        .in('id', memberIds);

      if (profilesError || !members?.length) {
        console.error('Error fetching member profiles:', profilesError);
        continue;
      }

      // Format the meeting time for the notification. A meeting with an end
      // time gets a proper window — "5:00 – 7:00 PM", the AM/PM said once —
      // instead of the raw start time alone. Nat: "i couldnt add window,
      // like 5-7, i could only put in 5pm" (migration 202). A meeting with
      // no end time still reads the raw `event.event_time` exactly as it
      // always has.
      let meetingTime = event.event_time ? ` at ${event.event_time}` : '';
      if (event.event_time && event.end_time) {
        const startText = formatClock(event.event_time);
        const endText = formatClock(event.end_time);
        if (startText && endText) {
          const startPeriod = startText.slice(-2);
          const endPeriod = endText.slice(-2);
          const windowText = startPeriod === endPeriod
            ? `${startText.slice(0, -3)} – ${endText}`
            : `${startText} – ${endText}`;
          meetingTime = ` at ${windowText}`;
        }
      }
      const notificationTitle = 'Meeting Tomorrow';
      const notificationBody = `${event.title}${meetingTime} is scheduled for tomorrow.`;

      for (const member of members) {
        // Idempotency check: see if a meeting_reminder notification already exists
        // for this user, for this event date
        const { data: existingNotifs, error: checkError } = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('user_id', member.id)
          .eq('community_id', event.community_id)
          .eq('notification_type', 'meeting_reminder')
          .eq('title', notificationTitle)
          .eq('content', notificationBody)
          .limit(1);

        if (checkError) {
          console.error(`Error checking existing notifications for ${member.id}:`, checkError);
        }

        if (existingNotifs && existingNotifs.length > 0) {
          console.log(`Skipping duplicate reminder for user ${member.id}, event ${event.id}`);
          totalSkippedDuplicate++;
          continue;
        }

        // Create in-app notification
        const { error: notifError } = await supabaseAdmin.from('notifications').insert({
          user_id: member.id,
          community_id: event.community_id,
          notification_type: 'meeting_reminder',
          title: notificationTitle,
          content: notificationBody,
        });

        if (!notifError) {
          totalNotificationsCreated++;
        } else {
          console.error(`Failed to create notification for ${member.id}:`, notifError);
        }

        // Send push notification if member has a push token
        if (member.push_token) {
          try {
            await sendExpoPushNotification(
              member.push_token,
              notificationTitle,
              notificationBody,
              {
                type: 'meeting_reminder',
                event_id: event.id,
                event_date: event.event_date,
              }
            );
            totalPushSent++;
          } catch (pushError) {
            console.error(`Push notification failed for ${member.id}:`, pushError);
          }
        }
      }
    }

    return jsonResponse({
      meetings_found: meetingEvents.length,
      push_sent: totalPushSent,
      notifications_created: totalNotificationsCreated,
      skipped_duplicate: totalSkippedDuplicate,
    });

  } catch (error) {
    console.error('Meeting reminder error:', error);
    return errorResponse('Internal server error', 500);
  }
});

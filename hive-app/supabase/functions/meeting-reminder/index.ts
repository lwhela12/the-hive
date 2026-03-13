import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

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

      // Format the meeting time for the notification
      const meetingTime = event.event_time
        ? ` at ${event.event_time}`
        : '';
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
